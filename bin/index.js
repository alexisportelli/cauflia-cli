#!/usr/bin/env node

import "dotenv/config";
import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { loadConfig, saveConfig, configWizard } from "../src/config.js";
import { startSession } from "../src/index.js";
import { listSessions, deleteSession } from "../src/session.js";

const program = new Command();

program
  .name("cauflia")
  .description("Cauflia — Agent IA conversationnel")
  .version("1.0.0");

program
  .argument("[prompt...]", "Prompt direct")
  .option("-m, --model <model>", "Modèle au format provider/modèle")
  .option("-n, --new", "Nouvelle session (ignore l'historique)")
  .action(async (promptArgs, opts) => {
    const config = loadConfig();
    if (opts.model) config.model = opts.model;
    const initialPrompt = promptArgs ? promptArgs.join(" ") : "";
    await startSession(config, initialPrompt, !!opts.new);
  });

program
  .command("run")
  .description("Mode non-interactif")
  .argument("<prompt...>", "Prompt à exécuter")
  .option("-m, --model <model>", "Modèle au format provider/modèle")
  .action(async (promptArgs, opts) => {
    const config = loadConfig();
    if (opts.model) config.model = opts.model;
    const prompt = promptArgs.join(" ");
    console.log(pc.cyan(`\n❯ ${prompt}`));
    await startSession(config, prompt);
  });

program
  .command("config")
  .description("Configuration des providers et modèles")
  .option("-s, --show", "Afficher la config (masque les clés)")
  .option("-k, --show-keys", "Afficher la config avec les clés visibles")
  .option("-m, --model <model>", "Définir le modèle (provider/modèle)")
  .option("-d, --delete-key <provider>", "Supprimer la clé API d'un provider (gemini, openai, anthropic, openrouter)")
  .action(async (opts) => {
    const config = loadConfig();
    if (opts.show || opts.showKeys) {
      console.log(pc.bold("\n  Configuration :"));
      console.log(`    ${pc.dim("Modèle :")}     ${pc.cyan(config.model)}`);
      for (const [name, pcfg] of Object.entries(config.provider)) {
        if (name === "ollama") {
          console.log(`    ${pc.dim(name)}: ${pc.dim(pcfg.baseUrl || "http://localhost:11434/v1")}`);
        } else if (opts.showKeys) {
          const key = pcfg.apiKey || "";
          const masked = key ? `${key.slice(0, 8)}${pc.dim(key.slice(8).replace(/./g, "●"))}` : pc.red("(aucune)");
          console.log(`    ${pc.dim(name)}: ${masked}`);
        } else {
          const status = pcfg.apiKey ? pc.green("✓") : pc.red("✗");
          console.log(`    ${pc.dim(name)}: ${status}`);
        }
      }
      console.log(`    ${pc.dim("Permissions :")}`);
      for (const [tool, perm] of Object.entries(config.permission || {})) {
        console.log(`      ${tool}: ${perm}`);
      }
      console.log("");
      return;
    }
    if (opts.model) { config.model = opts.model; saveConfig(config); console.log(pc.green(`✓ Modèle : ${config.model}`)); return; }
    if (opts.deleteKey) {
      const p = config.provider?.[opts.deleteKey];
      if (!p) { console.log(pc.yellow(`  Provider "${opts.deleteKey}" introuvable.`)); return; }
      p.apiKey = "";
      saveConfig(config);
      console.log(pc.green(`✔ Clé API "${opts.deleteKey}" supprimée.`));
      return;
    }
    const result = await configWizard(config);
    if (!result) { console.log(`  ${pc.yellow("Configuration annulée.")}\n`); return; }
    console.log("");
  });

// session command
program
  .command("session")
  .description("Gérer les sessions")
  .argument("[action]", "list, delete, ou clear")
  .argument("[id]", "ID de la session")
  .action((action, id) => {
    if (action === "list" || !action) {
      const sessions = listSessions();
      if (sessions.length === 0) { console.log(pc.dim("\n  Aucune session.\n")); return; }
      console.log(pc.bold(pc.magenta(`\n  Sessions (${sessions.length}):`)));
      for (const s of sessions) {
        const d = new Date(s.updated).toLocaleString("fr-FR");
        console.log(`  ${pc.cyan(s.id)}  ${pc.dim(d)}  ${s.messages.length} msgs  ${s.model}`);
      }
      console.log("");
      return;
    }
    if (action === "delete" && id) { deleteSession(id); console.log(pc.green(`✔ Session ${id} supprimée`)); return; }
    if (action === "clear") {
      for (const s of listSessions()) deleteSession(s.id);
      console.log(pc.green("✔ Toutes les sessions supprimées"));
      return;
    }
    console.log(pc.yellow("Usage: cauflia session list|delete <id>|clear"));
  });

program.parse(process.argv);
