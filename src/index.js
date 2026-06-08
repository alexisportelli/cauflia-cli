import pc from "picocolors";
import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { streamChat } from "./providers.js";
import { createSession, loadLatestSession, saveSession, findToolCall } from "./session.js";
import { executeTool, checkPermission, TOOL_NAMES } from "./tools.js";
import { parseModel, resolveApiKey, configWizard } from "./config.js";

function banner() {
  console.log(`\n  ${pc.bold("cauflia")} ${pc.dim("— Agent IA conversationnel")}`);
  console.log(`  ${pc.dim("┈".repeat(30))}\n`);
}

function showHelp() {
  console.log(`  ${pc.bold("Commandes :")}`);
  console.log(`    ${pc.cyan("/model <provider/modèle>")}    ${pc.dim("Changer de modèle")}`);
  console.log(`    ${pc.cyan("/new")}                        ${pc.dim("Nouvelle session")}`);
  console.log(`    ${pc.cyan("/help")}                       ${pc.dim("Afficher l'aide")}`);
  console.log(`    ${pc.cyan("exit")} / ${pc.cyan("quit")}          ${pc.dim("Sauvegarder et quitter")}`);
  console.log("");
}

export async function startSession(config, initialPrompt = "", forceNew = false) {
  const parsed = parseModel(config.model);
  let providerName = parsed.provider;
  let modelName = parsed.model;
  let apiKey = resolveApiKey(config, providerName);

  if (!apiKey && providerName !== "ollama") {
    console.log(`\n  ${pc.red("╌".repeat(25))}`);
    console.log(`  ${pc.red("✗")}  Aucune clé API pour ${pc.bold(providerName)}.`);
    console.log(`  ${pc.red("╌".repeat(25))}\n`);
    const rl = readline.createInterface({ input, output });
    const answer = await rl.question(`  ${pc.cyan("Configurer Cauflia maintenant ?")} ${pc.dim("(O/n)")} `);
    rl.close();
    if (answer.trim().toLowerCase() !== "n") {
      const result = await configWizard(config);
      if (!result) return;
      apiKey = resolveApiKey(config, providerName);
    }
    if (!apiKey && providerName !== "ollama") {
      console.log(`\n  ${pc.dim("Tu peux aussi passer par une variable d'environnement :")}`);
      console.log(`  ${pc.cyan(`  ${providerName.toUpperCase()}_API_KEY=... cauflia`)}\n`);
      return;
    }
  }

  const providerCfg = { ...config.provider?.[providerName], model: modelName, apiKey };
  if (providerName === "ollama" && !providerCfg.baseUrl) providerCfg.baseUrl = "http://localhost:11434/v1";

  let session = forceNew ? null : loadLatestSession();
  if (!session) session = createSession(config.model);

  banner();
  if (session.messages.length > 0) {
    console.log(`  ${pc.dim("Session reprise :")} ${pc.cyan(session.id)} ${pc.dim(`(${session.messages.length} messages)`)}`);
  }
  console.log(`  ${pc.dim("Modèle :")} ${pc.cyan(config.model)}`);
  if (initialPrompt) console.log(`  ${pc.dim("Mode :")} ${pc.cyan("non-interactif")}`);
  console.log("");

  const rl = readline.createInterface({ input, output, terminal: true });

  const processMessages = async () => {
    const maxIter = 15;
    for (let iter = 0; iter < maxIter; iter++) {
      const spinner = ["/", "-", "\\", "|"];
      let si = 0, spinTimer = null;
      const startSpin = () => {
        process.stdout.write(`  ${pc.dim(spinner[si])} Cauflia réfléchit...`);
        spinTimer = setInterval(() => {
          si = (si + 1) % spinner.length;
          process.stdout.write(`\r  ${pc.dim(spinner[si])} Cauflia réfléchit...`);
        }, 120);
      };
      const stopSpin = () => {
        if (spinTimer) { clearInterval(spinTimer); spinTimer = null; }
        process.stdout.write("\r" + " ".repeat(40) + "\r");
      };

      let fullText = "", streamEmpty = true;

      try {
        startSpin();
        for await (const ev of streamChat(providerName, providerCfg, session.messages)) {
          if (ev.type === "chunk") {
            if (streamEmpty) { stopSpin(); console.log(`  ${pc.bold("Cauflia")} ${pc.dim("›")} `); streamEmpty = false; }
            fullText += ev.text;
            process.stdout.write(ev.text);
          }
        }
        if (streamEmpty) stopSpin();
        console.log("");

        const tc = findToolCall(fullText);
        if (tc) {
          const toolName = tc.tool || tc.name;
          const toolArgs = tc.arguments || tc.args;
          const perm = checkPermission(config, toolName);

          const cleanText = fullText.replace(/```(?:json)?[\s\S]*?"tool"[\s\S]*?```/gi, "").trim();
          if (cleanText) {
            session.messages.push({ role: "assistant", content: cleanText });
          }

          if (perm === "deny") {
            session.messages.push({ role: "user", content: `[OUTIL BLOQUÉ] ${toolName} est interdit par la config.` });
            continue;
          }

          if (perm === "ask") {
            console.log(`\n  ${pc.bold(pc.yellow(`🔧 ${toolName}`))} ${pc.dim(JSON.stringify(toolArgs))}`);
            const answer = await rl.question(`  ${pc.cyan("Autoriser cet outil ?")} ${pc.dim("(O/n)")} `);
            if (answer.trim().toLowerCase() === "n") {
              console.log(`  ${pc.yellow("⛔ Refusé")}\n`);
              session.messages.push({ role: "user", content: `[REFUS] L'utilisateur a refusé l'outil ${toolName}.` });
              continue;
            }
          }

          console.log(`  ${pc.dim(`⚙️ ${toolName}...`)}`);
          const result = await executeTool(toolName, toolArgs, config);
          const status = result.success ? pc.green("✓") : pc.red("✗");
          console.log(`  ${status} ${pc.dim(JSON.stringify(result).slice(0, 200))}\n`);

          session.messages.push({ role: "user", content: `[RÉSULTAT ${toolName}]: ${JSON.stringify(result)}` });
          continue;
        }

        if (fullText) {
          session.messages.push({ role: "assistant", content: fullText });
        }
        saveSession(session);
        return;

      } catch (err) {
        stopSpin();
        const msg = err.message || String(err);
        if (msg.includes("403") || msg.includes("API_KEY")) {
          console.error(`  ${pc.red("✗ Clé API invalide ou bloquée pour")} ${pc.bold(providerName)}.`);
          console.error(`  ${pc.dim("Vérifie ta clé avec : cauflia config")}`);
        } else {
          console.error(`  ${pc.red(msg)}`);
        }
        return;
      }
    }
    console.log(`  ${pc.yellow("⚠ Trop d'itérations d'outils, arrêt.")}`);
  };

  const saveAndExit = () => {
    saveSession(session);
    rl.close();
    console.log(`\n  ${pc.dim("Session sauvegardée. À bientôt !")}\n`);
    process.exit(0);
  };

  process.on("SIGINT", saveAndExit);
  process.on("SIGTERM", saveAndExit);

  if (initialPrompt) {
    console.log(`  ${pc.dim("❯")} ${initialPrompt}\n`);
    session.messages.push({ role: "user", content: initialPrompt });
    saveSession(session);
    await processMessages();
    rl.close();
    return;
  }

  while (true) {
    let input;
    try {
      input = await rl.question(`  ${pc.bold("❯")} `);
    } catch {
      saveSession(session);
      break;
    }
    const t = input.trim();

    if (["exit", "quit"].includes(t.toLowerCase())) {
      saveAndExit();
    }
    if (t === "/help") {
      showHelp();
      continue;
    }
    if (t.startsWith("/model ")) {
      config.model = t.slice(7).trim();
      const p = parseModel(config.model);
      providerName = p.provider;
      modelName = p.model;
      providerCfg.model = modelName;
      console.log(`  ${pc.green("✓")} ${pc.dim("Modèle :")} ${pc.cyan(config.model)}`);
      Object.assign(providerCfg, config.provider?.[providerName] || {});
      providerCfg.apiKey = resolveApiKey(config, providerName);
      continue;
    }
    if (t === "/new") {
      session = createSession(config.model);
      console.log(`  ${pc.green("✓")} ${pc.dim("Nouvelle session :")} ${pc.cyan(session.id)}`);
      continue;
    }
    if (!t) continue;

    session.messages.push({ role: "user", content: t });
    saveSession(session);
    await processMessages();
  }
  rl.close();
}
