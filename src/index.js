import pc from "picocolors";
import * as p from "@clack/prompts";
import readline from "readline";
import { streamChat, chatCompletion, supportsNativeTools, SYSTEM_PROMPT } from "./providers.js";
import { createSession, loadLatestSession, saveSession, findToolCall } from "./session.js";
import { TOOLS, executeTool } from "./tools.js";

export async function startSession(config, initialPrompt = "") {
  const activeProvider = config.activeProvider || "gemini";
  const activeModel = config.activeModel || "gemini-1.5-flash";
  const providerCfg = config.providers?.[activeProvider] || {};

  if (!providerCfg.apiKey && activeProvider !== "ollama") {
    p.log.error(pc.red(`Aucune clé API configurée pour ${activeProvider}.`));
    p.log.info(pc.cyan(`Configure-la avec : cauflia config`));
    return;
  }

  // Load or create session
  let session = loadLatestSession();
  if (session && session.provider !== activeProvider) session = null;
  if (!session) {
    session = createSession(activeProvider, activeModel);
  }

  console.log(pc.bold(pc.magenta("\n╭──────────────────────────────────────────╮")));
  console.log(pc.bold(pc.magenta("│          🤖  CAUFLIA CHAT  🤖           │")));
  console.log(pc.bold(pc.magenta("╰──────────────────────────────────────────╯")));
  console.log(pc.dim(`  Modèle : ${activeProvider}/${activeModel}`));
  console.log(pc.dim(`  Session : ${session.id}`));
  console.log(pc.dim(`  Messages : ${session.messages.length}`));
  if (session.messages.length > 0) {
    console.log(pc.cyan(`  ↳ Session reprise (${session.messages.length} messages historiques)\n`));
  } else {
    console.log("");
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question(`\n${pc.bold(pc.magenta("👤 Vous ❯ "))}`, async (input) => {
      const trimmed = input.trim();
      if (["exit", "quit", "/exit", "/quit"].includes(trimmed.toLowerCase())) {
        console.log(pc.yellow("Session sauvegardée. À bientôt !"));
        saveSession(session);
        rl.close();
        process.exit(0);
      }
      if (trimmed.startsWith("/model ")) {
        const parts = trimmed.split(" ");
        if (parts.length >= 3) {
          session.provider = parts[1];
          session.model = parts[2];
          saveSession(session);
          console.log(pc.green(`✔ Modèle changé : ${parts[1]}/${parts[2]}`));
        } else {
          console.log(pc.yellow("Usage: /model <provider> <model>"));
        }
        ask();
        return;
      }
      if (trimmed.startsWith("/new")) {
        session = createSession(activeProvider, activeModel);
        console.log(pc.green(`✔ Nouvelle session : ${session.id}`));
        ask();
        return;
      }
      if (!trimmed) {
        ask();
        return;
      }
      await handleMessage(trimmed);
    });
  };

  const handleMessage = async (text) => {
    session.messages.push({ role: "user", content: text });
    saveSession(session);

    const s = p.spinner();
    s.start(pc.magenta("Cauflia réfléchit..."));

    try {
      const useNative = supportsNativeTools(activeProvider) && TOOLS.length > 0;
      let fullText = "";
      let toolCalls = [];

      if (useNative) {
        s.stop(pc.green("✔"));
        const result = await chatCompletion(activeProvider, { ...providerCfg, model: activeModel }, session.messages, TOOLS);
        fullText = result.text;
        toolCalls = result.toolCalls;

        if (fullText) {
          console.log(`\n${pc.bold(pc.magenta("Cauflia ❯ "))}${fullText}`);
        }
      } else {
        let isFirst = true;
        const stream = streamChat(activeProvider, { ...providerCfg, model: activeModel }, session.messages);
        for await (const event of stream) {
          if (event.type === "chunk") {
            if (isFirst) {
              s.stop(pc.green("✔"));
              console.log(`\n${pc.bold(pc.magenta("Cauflia ❯ "))}`);
              isFirst = false;
            }
            fullText += event.text;
            process.stdout.write(event.text);
          }
        }
        if (isFirst) s.stop(pc.green("✔"));
        console.log("");

        const toolCallJson = findToolCall(fullText);
        if (toolCallJson) {
          toolCalls = [toolCallJson];
          fullText = fullText.replace(/```(?:json)?\s*\{[^}]*"tool"[^}]*\}\s*```/gi, "").trim();
        }
      }

      // Execute tools and continue
      if (toolCalls.length > 0) {
        session.messages.push({ role: "assistant", content: fullText || "[Utilisation d'outils...]" });
        saveSession(session);

        for (const tc of toolCalls) {
          const toolResult = await executeTool(tc.name || tc.tool, tc.arguments || tc.args, config);
          session.messages.push({
            role: "user",
            content: `[RÉSULTAT ${tc.name || tc.tool}]: ${JSON.stringify(toolResult)}`,
          });
        }

        // Continue the conversation with tool results
        s.start(pc.magenta("Cauflia continue..."));
        let isFirst = true;
        let followUpText = "";
        const stream = streamChat(activeProvider, { ...providerCfg, model: activeModel }, session.messages);
        for await (const event of stream) {
          if (event.type === "chunk") {
            if (isFirst) {
              s.stop(pc.green("✔"));
              console.log(`\n${pc.bold(pc.magenta("Cauflia ❯ "))}`);
              isFirst = false;
            }
            followUpText += event.text;
            process.stdout.write(event.text);
          }
        }
        if (isFirst) s.stop(pc.green("✔"));
        console.log("");
        session.messages.push({ role: "assistant", content: followUpText || fullText });
      } else if (fullText) {
        session.messages.push({ role: "assistant", content: fullText });
      }

      saveSession(session);
    } catch (err) {
      s.stop(pc.red("✖ Erreur"));
      console.error(pc.red(err.message || String(err)));
    }

    ask();
  };

  if (initialPrompt) {
    console.log(pc.cyan(`\nLancement : ${initialPrompt}\n`));
    await handleMessage(initialPrompt);
  } else {
    ask();
  }
}
