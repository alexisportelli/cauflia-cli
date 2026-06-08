import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_PROMPT = `Tu es Cauflia, un assistant IA autonome et conversationnel. Tu réponds toujours en FRANÇAIS.

Tu as accès à des outils puissants pour t'aider :
- execute_command : exécuter des commandes shell
- read_file / write_file : lire/écrire des fichiers
- list_directory : lister un dossier
- generate_video : générer une vidéo avec IA
- download_youtube : télécharger depuis YouTube
- edit_video : éditer/monter des vidéos
- manage_library : gérer la médiathèque

Pour utiliser un outil, réponds avec un bloc JSON dans une balise markdown \`\`\`json :
{
  "tool": "nom_de_l_outil",
  "arguments": { ... }
}

Sinon, réponds normalement.`;

function toGeminiHistory(messages) {
  return messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));
}

function convertToolsToGemini(tools) {
  if (!tools || tools.length === 0) return undefined;
  return [{
    functionDeclarations: tools.map(t => t.function),
  }];
}

// --- Gemini ---
const GEMINI_MODELS = ["gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash", "gemini-2.0-pro"];

async function* streamGemini(config, messages) {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const modelName = config.model || "gemini-1.5-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
  });

  const history = messages.length > 1 ? toGeminiHistory(messages.slice(0, -1)) : [];
  const chat = model.startChat({ history });

  const lastContent = messages[messages.length - 1]?.content || "";
  const result = await chat.sendMessageStream(lastContent);

  let fullText = "";
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      fullText += text;
      yield { type: "chunk", text };
    }
  }
  yield { type: "done", fullText };
}

async function geminiChat(config, messages, tools) {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const modelName = config.model || "gemini-1.5-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: SYSTEM_PROMPT,
    tools: convertToolsToGemini(tools),
  });

  const history = messages.length > 1 ? toGeminiHistory(messages.slice(0, -1)) : [];
  const chat = model.startChat({ history });

  const lastContent = messages[messages.length - 1]?.content || "";
  const result = await chat.sendMessage(lastContent);
  const response = result.response;

  const text = response.text();
  const toolCalls = [];

  const candidates = response.candidates;
  if (candidates && candidates.length > 0) {
    const parts = candidates[0].content?.parts || [];
    for (const part of parts) {
      if (part.functionCall) {
        toolCalls.push({
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        });
      }
    }
  }

  return { text, toolCalls };
}

// --- OpenAI-compatible (OpenAI, OpenRouter, Together, Groq, Ollama ...) ---
async function* streamOpenAI(config, messages) {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const modelName = config.model || "gpt-4o";

  const body = {
    model: modelName,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
    stream: true,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || "";
        if (delta) {
          fullText += delta;
          yield { type: "chunk", text: delta };
        }
      } catch {}
    }
  }
  yield { type: "done", fullText };
}

async function openAIChat(config, messages, tools) {
  const baseUrl = config.baseUrl || "https://api.openai.com/v1";
  const modelName = config.model || "gpt-4o";

  const body = {
    model: modelName,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${res.status}: ${err}`);
  }

  const json = await res.json();
  const msg = json.choices?.[0]?.message || {};
  const text = msg.content || "";
  const toolCalls = (msg.tool_calls || []).map(tc => ({
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments),
  }));

  return { text, toolCalls };
}

// --- Anthropic ---
async function* streamAnthropic(config, messages) {
  const modelName = config.model || "claude-sonnet-4-20250514";
  const body = {
    model: modelName,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(line.slice(6));
        if (json.type === "content_block_delta" && json.delta?.text) {
          fullText += json.delta.text;
          yield { type: "chunk", text: json.delta.text };
        }
      } catch {}
    }
  }
  yield { type: "done", fullText };
}

async function anthropicChat(config, messages, tools) {
  const modelName = config.model || "claude-sonnet-4-20250514";
  const body = {
    model: modelName,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
  };
  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }

  const json = await res.json();
  let text = "";
  const toolCalls = [];

  for (const block of json.content || []) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({ name: block.name, arguments: block.input });
    }
  }

  return { text, toolCalls };
}

// --- Router ---
export function isGeminiModel(model) {
  return GEMINI_MODELS.some(m => model?.startsWith(m.split("-")[0])) || model?.startsWith("gemini");
}

export function supportsNativeTools(provider) {
  return ["gemini", "openai", "openrouter", "anthropic"].includes(provider);
}

export async function* streamChat(provider, config, messages) {
  switch (provider) {
    case "gemini":
      yield* streamGemini(config, messages);
      break;
    case "openai":
    case "openrouter":
    case "ollama":
    case "together":
    case "groq":
      yield* streamOpenAI(config, messages);
      break;
    case "anthropic":
      yield* streamAnthropic(config, messages);
      break;
    default:
      throw new Error(`Provider inconnu: ${provider}`);
  }
}

export async function chatCompletion(provider, config, messages, tools) {
  switch (provider) {
    case "gemini":
      return geminiChat(config, messages, tools);
    case "openai":
    case "openrouter":
    case "ollama":
    case "together":
    case "groq":
      return openAIChat(config, messages, tools);
    case "anthropic":
      return anthropicChat(config, messages, tools);
    default:
      throw new Error(`Provider inconnu: ${provider}`);
  }
}

export { SYSTEM_PROMPT };
