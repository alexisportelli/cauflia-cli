#!/usr/bin/env node

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs";
import path from "path";
import os from "os";
import { startSession } from "../src/index.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "cauflia");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { api_key: "", GEMINI_API_KEY: "", saas_url: "" };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return { api_key: "", GEMINI_API_KEY: "", saas_url: "" };
  }
}

function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

function showBanner() {
  console.log("");
  console.log(pc.bold(pc.hex("#6366f1")("    ╔═══════════════════════════════════════════╗")));
  console.log(pc.bold(pc.hex("#a855f7")("    ║           ") + pc.bold(pc.hex("#ec4899")("CAUFLIA v1.0")) + pc.bold(pc.hex("#a855f7")("            ║")));
  console.log(pc.bold(pc.hex("#6366f1")("    ╚═══════════════════════════════════════════╝")));
  console.log(pc.dim("    Agent autonome de création vidéo — mode interactif"));
  console.log("");
}

const program = new Command();

program
  .name("cauflia")
  .description("Cauflia — Agent autonome de création vidéo")
  .version("1.0.0");

program
  .argument("[prompt...]", "Prompt direct pour générer une vidéo")
  .action(async (promptArgs) => {
    const config = loadConfig();
    const initialPrompt = promptArgs ? promptArgs.join(" ") : "";

    console.clear();
    showBanner();

    if (!config.GEMINI_API_KEY) {
      p.note(
        "Configure ta clé API Google Gemini pour utiliser Cauflia.",
        pc.hex("#a855f7")("Configuration requise")
      );

      const setup = await p.confirm({
        message: pc.hex("#6366f1")("Configurer maintenant ?"),
      });

      if (!setup || p.isCancel(setup)) {
        p.outro(pc.yellow("Utilise 'cauflia config' pour configurer plus tard."));
        process.exit(0);
      }

      const geminiKey = await p.password({
        message: "Clé API Google Gemini :",
        placeholder: "AIzaSy...",
        validate: (v) => { if (!v) return "Requis"; },
      });

      if (p.isCancel(geminiKey)) { p.outro(pc.yellow("Annulé.")); process.exit(0); }

      const saasKey = await p.text({
        message: "Clé API SaaS Cauflia (optionnelle — laisse vide pour mode local) :",
        placeholder: "vc_... (optionnel)",
      });

      const saasUrl = await p.text({
        message: "URL du SaaS Cauflia (optionnel) :",
        placeholder: "https://cauflia.app",
      });

      config.GEMINI_API_KEY = geminiKey;
      config.api_key = saasKey || "";
      config.saas_url = saasUrl || "";
      saveConfig(config);
      p.log.success(pc.green("✔ Configuration sauvegardée !"));
    }

    await startSession(config, initialPrompt);
  });

program
  .command("config")
  .description("Configurer les clés API")
  .option("-g, --gemini-key <key>", "Clé API Google Gemini")
  .option("-k, --api-key <key>", "Clé API Cauflia (optionnelle)")
  .option("-u, --url <url>", "URL du SaaS Cauflia (optionnel)")
  .option("-s, --show", "Afficher la configuration actuelle")
  .action(async (options) => {
    const config = loadConfig();
    let updated = false;

    if (options.show) {
      console.log("");
      console.log(pc.bold(pc.hex("#a855f7")(`  Configuration actuelle :`)));
      console.log(`    ${pc.dim("Gemini :")}     ${config.GEMINI_API_KEY ? pc.green("✔ configurée") : pc.red("✖ manquante")}`);
      console.log(`    ${pc.dim("Clé SaaS :")}   ${config.api_key ? pc.green("✔ configurée") : pc.dim("(non définie — mode local)")}`);
      console.log(`    ${pc.dim("URL SaaS :")}   ${config.saas_url || pc.dim("(non définie — mode local)")}`);
      console.log("");
      return;
    }

    if (options.geminiKey) { config.GEMINI_API_KEY = options.geminiKey; updated = true; }
    if (options.apiKey) { config.api_key = options.apiKey; updated = true; }
    if (options.url) { config.saas_url = options.url; updated = true; }

    if (updated) {
      saveConfig(config);
      console.log(pc.green("✔ Configuration mise à jour !"));
      return;
    }

    const group = await p.group({
      GEMINI_API_KEY: () => p.password({
        message: "Clé API Google Gemini :",
        defaultValue: config.GEMINI_API_KEY,
      }),
      api_key: () => p.text({
        message: "Clé API Cauflia (optionnelle — laisse vide pour mode local) :",
        defaultValue: config.api_key,
      }),
      saas_url: () => p.text({
        message: "URL du SaaS Cauflia (optionnel) :",
        defaultValue: config.saas_url,
      }),
    }, { onCancel: () => { p.cancel("Annulé."); process.exit(0); } });

    saveConfig(group);
    p.log.success(pc.green("✔ Configuration sauvegardée !"));
  });

program.parse(process.argv);
