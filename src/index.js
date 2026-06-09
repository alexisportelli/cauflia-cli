import pc from "picocolors";
import * as p from "@clack/prompts";
import readline from "readline";
import { streamChat } from "./providers.js";
import { createSession, loadLatestSession, saveSession, findToolCall } from "./session.js";
import { executeTool, checkPermission, TOOL_NAMES } from "./tools.js";
import { parseModel, resolveApiKey } from "./config.js";

export async function startSession(config, initialPrompt = "") {
  const { provider: providerName, model: modelName } = parseModel(config.model || "gemini/gemini-1.5-flash");
  const apiKey = resolveApiKey(config, providerName);
  if (!apiKey && providerName !== "ollama") {
    p.log.error(pc.red(`Aucune clé API pour ${providerName}. Fais 'cauflia config' d'abord.`));
    return;
  }

  const providerCfg = { ...config.provider?.[providerName], model: modelName, apiKey };
  if (providerName === "ollama" && !providerCfg.baseUrl) providerCfg.baseUrl = "http://localhost:11434/v1";

  // Auto-continue last session (OpenCode behavior)
  let session = loadLatestSession();
  if (!session) session = createSession(config.model);

  // UI
  console.log(pc.bold(pc.magenta("\n╭──────────────────────────────────────────╮")));
  console.log(pc.bold(pc.magenta("│          🤖  CAUFLIA  🤖                │")));
  console.log(pc.bold(pc.magenta("╰──────────────────────────────────────────╯")));
  console.log(pc.dim(`  Model: ${config.model}`));
  console.log(pc.dim(`  Session: ${session.id} (${session.messages.length} msgs)`));
  if (session.messages.length > 0) console.log(pc.cyan("  ↳ Session reprise automatiquement\n"));

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Core loop: stream response, handle tool calls, loop until text only
  const processMessages = async () => {
    const maxIter = 15;
    for (let iter = 0; iter < maxIter; iter++) {
      const s = p.spinner();
      s.start(pc.magenta("Cauflia..."));
      let fullText = "", isFirst = true;

      try {
        for await (const ev of streamChat(providerName, providerCfg, session.messages)) {
          if (ev.type === "chunk") {
            if (isFirst) { s.stop(""); console.log(`\n${pc.bold(pc.magenta("Cauflia ❯ "))}`); isFirst = false; }
            fullText += ev.text;
            process.stdout.write(ev.text);
          }
        }
        if (isFirst) s.stop("");
        console.log("");

        // Check for tool call
        const tc = findToolCall(fullText);
        if (tc) {
          const toolName = tc.tool || tc.name;
          const toolArgs = tc.arguments || tc.args;
          const perm = checkPermission(config, toolName);

          // Strip tool JSON from display text
          const cleanText = fullText.replace(/```(?:json)?\s*\{[^}]*"tool"[^}]*\}\s*```/gi, "").trim();
          if (cleanText) {
            session.messages.push({ role: "assistant", content: cleanText });
          } else if (iter === 0 && isFirst) {
            // Tool-only response, nothing to display yet
          }

          if (perm === "deny") {
            session.messages.push({ role: "user", content: `[OUTIL BLOQUÉ] ${toolName} est interdit par la config.` });
            continue;
          }

          if (perm === "ask") {
            console.log(`\n${pc.bold(pc.yellow(`🔧 ${toolName} ?`))} ${pc.dim(JSON.stringify(toolArgs))}`);
            const ok = await p.confirm({ message: pc.cyan("Autoriser ?") });
            if (!ok || p.isCancel(ok)) {
              console.log(pc.yellow("⛔ Refusé"));
              session.messages.push({ role: "user", content: `[REFUS] L'utilisateur a refusé l'outil ${toolName}.` });
              continue;
            }
          }

          console.log(`${pc.dim(`⚙️ ${toolName}...`)}`);
          const result = await executeTool(toolName, toolArgs, config);
          const status = result.success ? pc.green("✔ OK") : pc.red("✖ ÉCHEC");
          console.log(`  ${status} ${pc.dim(JSON.stringify(result).slice(0, 200))}`);

          session.messages.push({ role: "user", content: `[RÉSULTAT ${toolName}]: ${JSON.stringify(result)}` });
          continue; // Loop: AI will see the result and respond
        }

        // No tool call — normal assistant response
        session.messages.push({ role: "assistant", content: fullText });
        saveSession(session);
        return; // Done, wait for user input

      } catch (err) {
        s.stop(pc.red("✖"));
        console.error(pc.red(err.message || String(err)));
        return;
      }
    }
    console.log(pc.yellow("⚠ Trop d'itérations d'outils, arrêt."));
  };

  const ask = () => {
    rl.question(`\n${pc.bold(pc.magenta("❯ "))}`, async (input) => {
      const t = input.trim();
      if (["exit", "quit"].includes(t.toLowerCase())) {
        saveSession(session);
        console.log(pc.yellow("Session sauvegardée. À bientôt !"));
        rl.close();
        process.exit(0);
      }
      if (t.startsWith("/model ")) {
        config.model = t.slice(7).trim();
        const { provider: np, model: nm } = parseModel(config.model);
        providerCfg.model = nm;
        console.log(pc.green(`✔ Model: ${config.model}`));
        Object.assign(providerCfg, config.provider?.[np] || {});
        providerCfg.apiKey = resolveApiKey(config, np);
        ask(); return;
      }
      if (t === "/new") {
        session = createSession(config.model);
        console.log(pc.green(`✔ Nouvelle session: ${session.id}`));
        ask(); return;
      }
      if (!t) { ask(); return; }

      session.messages.push({ role: "user", content: t });
      saveSession(session);
      await processMessages();
      ask();
    });
  };

  if (initialPrompt) {
    console.log(pc.cyan(`\n❯ ${initialPrompt}\n`));
    session.messages.push({ role: "user", content: initialPrompt });
    saveSession(session);
    await processMessages();
  }
  ask();
}
