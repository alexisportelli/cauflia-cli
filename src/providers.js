import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM = `Tu es Cauflia, un assistant IA autonome. Tu réponds toujours en FRANÇAIS.

OUTILS DISPONIBLES (appelle-les avec un bloc JSON dans \`\`\`json) :
- execute_command : exécute des commandes shell
- read_file / write_file : lit/écrit des fichiers
- list_directory : liste un dossier
- generate_video : génère une vidéo avec IA
- download_youtube : télécharge depuis YouTube
- edit_video : édite/monte des vidéos
- manage_library : gère la médiathèque

Pour utiliser un outil, termine ta réponse par :
\`\`\`json
{ "tool": "nom", "arguments": { ... } }
\`\`\`
Tu peux aussi répondre normalement sans outil.`;

// --- Gemini ---
async function* streamGemini(cfg, messages) {
  const genAI = new GoogleGenerativeAI(cfg.apiKey);
  const model = genAI.getGenerativeModel({ model: cfg.model || "gemini-1.5-flash", systemInstruction: SYSTEM });

  const history = messages.length > 1 ? messages.slice(0, -1).map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  })) : [];

  const chat = model.startChat({ history });
  const last = messages[messages.length - 1]?.content || "";
  const result = await chat.sendMessageStream(last);

  let full = "";
  for await (const chunk of result.stream) {
    const t = chunk.text();
    if (t) { full += t; yield { type: "chunk", text: t }; }
  }
  yield { type: "done", fullText: full };
}

// --- OpenAI-compatible ---
async function* streamOpenAI(cfg, messages) {
  const baseUrl = cfg.baseUrl || "https://api.openai.com/v1";
  const body = {
    model: cfg.model || "gpt-4o",
    messages: [{ role: "system", content: SYSTEM }, ...messages],
    stream: true,
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (d === "[DONE]") continue;
      try {
        const delta = JSON.parse(d).choices?.[0]?.delta?.content || "";
        if (delta) { full += delta; yield { type: "chunk", text: delta }; }
      } catch {}
    }
  }
  yield { type: "done", fullText: full };
}

// --- Anthropic ---
async function* streamAnthropic(cfg, messages) {
  const body = {
    model: cfg.model || "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: SYSTEM,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    stream: true,
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "", full = "";

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
          full += json.delta.text;
          yield { type: "chunk", text: json.delta.text };
        }
      } catch {}
    }
  }
  yield { type: "done", fullText: full };
}

// --- Router ---
export async function* streamChat(provider, cfg, messages) {
  switch (provider) {
    case "gemini": yield* streamGemini(cfg, messages); break;
    case "openai":
    case "openrouter":
    case "ollama":
    case "together":
    case "groq":
      yield* streamOpenAI(cfg, messages); break;
    case "anthropic": yield* streamAnthropic(cfg, messages); break;
    default: throw new Error(`Provider inconnu: ${provider}`);
  }
}
