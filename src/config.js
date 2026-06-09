import fs from "fs";
import path from "path";
import os from "os";
import pc from "picocolors";
import * as p from "@clack/prompts";

const CONFIG_DIR = path.join(os.homedir(), ".config", "cauflia");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const DANGEROUS_CMD_PATTERNS = [
  /^rm\s+-rf?\s+\//i, /^rm\s+-rf?\s+~/, /^rm\s+-rf?\s+\/\*/i,
  /^format\s+\w:\s*\/?(q|fs)/i, /^del\s+\/f\s+\/s/i, /^rd\s+\/s\s+\/q/i,
  /^shutdown\s+\/s/i, /^halt$/i, /^poweroff$/i, /^reboot$/i,
  /^mkfs/, /^fdisk/, /^dd\s+if=/i,
  /:\(\)\s*\{/, />\s*\\?\/dev\//,
];

export function isDangerousCommand(cmd) {
  return DANGEROUS_CMD_PATTERNS.some(p => p.test(cmd.trim()));
}

export function defaultConfig() {
  return {
    model: "gemini/gemini-1.5-flash",
    provider: {
      gemini: { apiKey: "" },
      openai: { apiKey: "" },
      anthropic: { apiKey: "" },
      openrouter: { apiKey: "", baseUrl: "https://openrouter.ai/api/v1" },
      ollama: { baseUrl: "http://localhost:11434/v1" },
    },
    permission: {
      execute_command: "ask",
      read_file: "allow",
      write_file: "ask",
      list_directory: "allow",
      generate_video: "ask",
      download_youtube: "ask",
      edit_video: "ask",
      manage_library: "allow",
    },
  };
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return defaultConfig();
  try {
    const c = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    const d = defaultConfig();

    if (c.GEMINI_API_KEY && !c.provider?.gemini?.apiKey) {
      if (!c.provider) c.provider = {};
      if (!c.provider.gemini) c.provider.gemini = { apiKey: "" };
      c.provider.gemini.apiKey = c.GEMINI_API_KEY;
      delete c.GEMINI_API_KEY;
    }

    c.provider = { ...d.provider, ...c.provider };
    c.permission = { ...d.permission, ...c.permission };
    if (!c.model) c.model = d.model;
    return c;
  } catch (err) {
    console.warn(`  ${pc.yellow("⚠ Config corrompue, utilisation des valeurs par défaut :")} ${pc.dim(err.message)}`);
    return defaultConfig();
  }
}

export function saveConfig(config) {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export function parseModel(modelStr) {
  const parts = modelStr.split("/");
  if (parts.length === 2) return { provider: parts[0], model: parts[1] };
  return { provider: "gemini", model: "gemini-1.5-flash" };
}

export function resolveApiKey(config, providerName) {
  if (providerName === "ollama") return "ollama";
  const specificKey = process.env[`${providerName.toUpperCase()}_API_KEY`];
  if (specificKey) return specificKey;
  if (providerName === "gemini") {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) return geminiKey;
  }
  const p = config.provider?.[providerName];
  return p?.apiKey || null;
}

export async function configWizard(config) {
  console.log("");
  const model = await p.text({ message: "Modèle (provider/modèle):", defaultValue: config.model });
  if (p.isCancel(model)) return null;
  config.model = model || config.model;

  for (const [name, pcfg] of Object.entries(config.provider)) {
    if (name === "ollama") {
      const url = await p.text({ message: "URL Ollama:", defaultValue: pcfg.baseUrl || "http://localhost:11434/v1" });
      if (p.isCancel(url)) return null;
      pcfg.baseUrl = url;
    } else {
      const hasKey = pcfg.apiKey ? pc.green("(déjà configuré)") : pc.red("(manquant)");
      const clearHint = pcfg.apiKey ? pc.dim(" — laisser vide pour effacer") : "";
      console.log(`  ${pc.dim(name)} ${hasKey}${clearHint}`);
      const key = await p.password({ message: `Clé API ${name}:`, defaultValue: pcfg.apiKey || "" });
      if (p.isCancel(key)) return null;
      pcfg.apiKey = key;
    }
  }

  saveConfig(config);
  p.log.success(pc.green("✔ Config sauvegardée !"));
  return config;
}
