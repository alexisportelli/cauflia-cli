#!/usr/bin/env node

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs";
import path from "path";
import os from "os";
import { runAgent } from "../src/agent.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "cauflia");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// Helper to load config
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { api_key: "", GEMINI_API_KEY: "", saas_url: "http://localhost:3000" };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return { api_key: "", GEMINI_API_KEY: "", saas_url: "http://localhost:3000" };
  }
}

// Helper to save config
function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

const program = new Command();

program
  .name("cauflia")
  .description("Cauflia CLI - L'agent autonome de création de vidéos et stratégies relié à VelocityContent")
  .version("1.0.0");

// Primary interactive entrypoint
program
  .argument("[prompt...]", "Le prompt pour démarrer la création de stratégie et de vidéo")
  .action(async (promptArgs) => {
    const config = loadConfig();
    const joinedPrompt = promptArgs ? promptArgs.join(" ") : "";

    p.intro(`${pc.bgCyan(pc.black(" CAUFLIA CLI "))} ${pc.cyan("L'agent vidéo autonome relié à VelocityContent")}`);

    // Check if configured
    if (!config.api_key || !config.GEMINI_API_KEY) {
      p.note(
        "Vous devez configurer votre clé API VelocityContent et votre clé Gemini avant de continuer.",
        "Configuration requise"
      );
      
      const setup = await p.confirm({
        message: "Voulez-vous les configurer maintenant ?",
      });

      if (!setup || p.isCancel(setup)) {
        p.outro(pc.yellow("Opération annulée. Utilisez 'cauflia config' pour configurer vos clés plus tard."));
        process.exit(0);
      }

      const apiKey = await p.text({
        message: "Entrez votre clé API VelocityContent (vc_...) :",
        placeholder: "vc_...",
        validate(value) {
          if (!value.startsWith("vc_")) return "La clé doit commencer par vc_";
        },
      });

      if (p.isCancel(apiKey)) {
        p.outro(pc.yellow("Opération annulée."));
        process.exit(0);
      }

      const geminiKey = await p.password({
        message: "Entrez votre clé API Google Gemini :",
        placeholder: "AIzaSy...",
        validate(value) {
          if (!value) return "La clé Gemini est requise";
        },
      });

      if (p.isCancel(geminiKey)) {
        p.outro(pc.yellow("Opération annulée."));
        process.exit(0);
      }

      const saasUrl = await p.text({
        message: "Entrez l'URL du SaaS VelocityContent :",
        defaultValue: "http://localhost:3000",
        placeholder: "http://localhost:3000",
      });

      config.api_key = apiKey;
      config.GEMINI_API_KEY = geminiKey;
      config.saas_url = saasUrl || "http://localhost:3000";
      saveConfig(config);

      p.spinner().start();
      // Simulate validating key
      p.log.success(pc.green("Configuration sauvegardée avec succès !"));
    }

    let finalPrompt = joinedPrompt;
    if (!finalPrompt) {
      const promptInput = await p.text({
        message: "Que voulez-vous créer aujourd'hui ? (Ex: 'Crée un TikTok sur le café de spécialité')",
        placeholder: "Entrez votre prompt ici...",
        validate(value) {
          if (!value) return "Le prompt ne peut pas être vide";
        },
      });

      if (p.isCancel(promptInput)) {
        p.outro(pc.yellow("Opération annulée. À bientôt !"));
        process.exit(0);
      }
      finalPrompt = promptInput;
    }

    // Run the agent loop!
    try {
      await runAgent(finalPrompt, config);
    } catch (err) {
      p.log.error(pc.red(`Erreur critique de l'agent: ${err.message || err}`));
    }

    p.outro(`${pc.green("✔")} Travail terminé. Merci d'avoir utilisé ${pc.cyan("Cauflia")} !`);
  });

// Config command
program
  .command("config")
  .description("Configurer les clés API et l'URL du SaaS")
  .option("-k, --api-key <key>", "Clé API de VelocityContent")
  .option("-g, --gemini-key <key>", "Clé API Google Gemini")
  .option("-u, --url <url>", "URL du SaaS VelocityContent")
  .action(async (options) => {
    const config = loadConfig();
    let updated = false;

    if (options.apiKey) {
      config.api_key = options.apiKey;
      updated = true;
    }
    if (options.geminiKey) {
      config.GEMINI_API_KEY = options.geminiKey;
      updated = true;
    }
    if (options.url) {
      config.saas_url = options.url;
      updated = true;
    }

    if (updated) {
      saveConfig(config);
      console.log(pc.green("✔ Configuration mise à jour !"));
      process.exit(0);
    }

    // Interactive config mode
    const group = await p.group(
      {
        api_key: () =>
          p.text({
            message: "Clé API VelocityContent :",
            defaultValue: config.api_key,
          }),
        GEMINI_API_KEY: () =>
          p.password({
            message: "Clé API Google Gemini :",
            defaultValue: config.GEMINI_API_KEY,
          }),
        saas_url: () =>
          p.text({
            message: "URL du SaaS VelocityContent :",
            defaultValue: config.saas_url,
          }),
      },
      {
        onCancel: () => {
          p.cancel("Configuration annulée.");
          process.exit(0);
        },
      }
    );

    saveConfig(group);
    p.log.success(pc.green("✔ Clés API et paramètres enregistrés !"));
  });

program.parse(process.argv);
