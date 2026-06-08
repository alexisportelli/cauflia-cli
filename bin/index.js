#!/usr/bin/env node

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs";
import path from "path";
import os from "os";
import { startSession } from "../src/index.js";
import { listSessions } from "../src/session.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "cauflia");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function defaultConfig() {
  return {
    activeProvider: "gemini",
    activeModel: "gemini-1.5-flash",
    providers: {
      gemini: { apiKey: "" },
      openai: { apiKey: "", baseUrl: "https://api.openai.com/v1" },
      openrouter: { apiKey: "", baseUrl: "https://openrouter.ai/api/v1" },
      anthropic: { apiKey: "" },
      ollama: { baseUrl: "http://localhost:11434/v1", model: "llama3" },
    },
  };
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return defaultConfig();
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    const d = defaultConfig();
    c.providers = { ...d.providers, ...c.providers };
    return c;
  } catch {
    return defaultConfig();
  }
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

const program = new Command();

program
  .name("cauflia")
  .description("Cauflia — Agent IA conversationnel multi-provider")
  .version("1.0.0");

program
  .argument("[prompt...]", "Prompt direct pour lancer le chat")
  .action(async (promptArgs) => {
    const config = loadConfig();
    const initialPrompt = promptArgs ? promptArgs.join(" ") : "";

    console.clear();
    console.log("");
    console.log(pc.bold(pc.blue("    ╔═══════════════════════════════════════════╗")));
    console.log(pc.bold(pc.magenta("    ║           CAUFLIA v1.0            ║")));
    console.log(pc.bold(pc.blue("    ╚═══════════════════════════════════════════╝")));
    console.log(pc.dim("    Agent IA conversationnel · Multi-provider"));
    console.log("");

    // Check if at least one provider has a key
    const hasKey = Object.entries(config.providers).some(([name, p]) =>
      name === "ollama" ? true : p.apiKey
    );

    if (!hasKey) {
      p.note("Bienvenue dans Cauflia ! Configure au moins un provider pour commencer.", "Configuration");
      const setup = await p.confirm({ message: "Configurer maintenant ?" });
      if (!setup || p.isCancel(setup)) {
        p.outro(pc.yellow("Utilise 'cauflia config' plus tard."));
        process.exit(0);
      }
      await runConfigWizard(config);
    }

    await startSession(config, initialPrompt);
  });

program
  .command("config")
  .description("Configurer les providers et modèles")
  .option("-s, --show", "Afficher la configuration")
  .option("-p, --provider <name>", "Changer le provider actif (gemini, openai, anthropic, ollama, openrouter)")
  .option("-m, --model <name>", "Changer le modèle actif")
  .option("-g, --gemini-key <key>", "Définir la clé Gemini")
  .option("-o, --openai-key <key>", "Définir la clé OpenAI")
  .option("-a, --anthropic-key <key>", "Définir la clé Anthropic")
  .option("-r, --openrouter-key <key>", "Définir la clé OpenRouter")
  .action(async (options) => {
    const config = loadConfig();
    let updated = false;

    if (options.show) {
      console.log(pc.bold(pc.magenta("\n  Configuration actuelle :")));
      console.log(`    ${pc.dim("Provider :")}     ${pc.cyan(config.activeProvider)}`);
      console.log(`    ${pc.dim("Modèle :")}       ${pc.cyan(config.activeModel)}`);
      console.log("");
      for (const [name, pcfg] of Object.entries(config.providers)) {
        const status = name === "ollama"
          ? pc.dim(pcfg.baseUrl)
          : pcfg.apiKey
            ? pc.green("✔ configuré")
            : pc.red("✖ manquant");
        console.log(`    ${pc.dim(name)} : ${status}`);
      }
      console.log("");
      return;
    }

    if (options.provider) { config.activeProvider = options.provider; updated = true; }
    if (options.model) { config.activeModel = options.model; updated = true; }
    if (options.geminiKey) { config.providers.gemini.apiKey = options.geminiKey; updated = true; }
    if (options.openaiKey) { config.providers.openai.apiKey = options.openaiKey; updated = true; }
    if (options.anthropicKey) { config.providers.anthropic.apiKey = options.anthropicKey; updated = true; }
    if (options.openrouterKey) { config.providers.openrouter.apiKey = options.openrouterKey; updated = true; }

    if (updated) {
      saveConfig(config);
      console.log(pc.green("✔ Configuration mise à jour !"));
      return;
    }

    await runConfigWizard(config);
  });

program
  .command("sessions")
  .description("Lister les sessions existantes")
  .action(() => {
    const sessions = listSessions();
    if (sessions.length === 0) {
      console.log(pc.dim("\n  Aucune session existante.\n"));
      return;
    }
    console.log(pc.bold(pc.magenta(`\n  Sessions (${sessions.length}) :`)));
    for (const s of sessions) {
      const date = new Date(s.updated).toLocaleString("fr-FR");
      console.log(`    ${pc.cyan(s.id)} — ${pc.dim(date)} — ${s.messages.length} msg — ${s.provider}/${s.model}`);
    }
    console.log("");
  });

async function runConfigWizard(config) {
  const provider = await p.select({
    message: "Provider actif :",
    options: [
      { value: "gemini", label: "Gemini (Google)" },
      { value: "openai", label: "OpenAI (GPT)" },
      { value: "anthropic", label: "Anthropic (Claude)" },
      { value: "openrouter", label: "OpenRouter (multi-modèles)" },
      { value: "ollama", label: "Ollama (local)" },
    ],
    initialValue: config.activeProvider,
  });
  if (p.isCancel(provider)) { p.cancel("Annulé."); process.exit(0); }

  config.activeProvider = provider;

  if (provider === "ollama") {
    const url = await p.text({
      message: "URL de votre serveur Ollama :",
      defaultValue: config.providers.ollama.baseUrl || "http://localhost:11434/v1",
    });
    const model = await p.text({
      message: "Modèle Ollama (ex: llama3, mistral, codellama) :",
      defaultValue: config.providers.ollama.model || "llama3",
    });
    config.providers.ollama.baseUrl = url;
    config.providers.ollama.model = model;
    config.activeModel = model;
  } else {
    if (!config.providers[provider]?.apiKey) {
      const key = await p.password({
        message: `Clé API pour ${provider} :`,
        validate: (v) => { if (!v) return "Requis"; },
      });
      if (p.isCancel(key)) process.exit(0);
      if (!config.providers[provider]) config.providers[provider] = {};
      config.providers[provider].apiKey = key;
    }

    const model = await p.text({
      message: "Modèle (laisser vide pour défaut) :",
      defaultValue: config.activeModel,
    });
    config.activeModel = model || config.activeModel;
  }

  saveConfig(config);
  p.log.success(pc.green("✔ Configuration sauvegardée !"));
}

program.parse(process.argv);
