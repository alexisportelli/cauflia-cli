import fs from "fs";
import path from "path";
import os from "os";

const SESSION_DIR = path.join(os.homedir(), ".config", "cauflia", "sessions");

function ensure() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
}

let _counter = 0;

function stamp() {
  _counter++;
  return `${Date.now()}_${_counter}`;
}

export function createSession(model) {
  ensure();
  const s = {
    id: `sess_${stamp()}`,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    model,
    messages: [],
  };
  saveSession(s);
  return s;
}

export function saveSession(s) {
  ensure();
  const data = { ...s, updated: new Date().toISOString() };
  fs.writeFileSync(path.join(SESSION_DIR, `${data.id}.json`), JSON.stringify(data, null, 2), "utf-8");
}

let _saveCounter = Date.now();
function nextSortKey() { _saveCounter++; return _saveCounter; }

export function loadLatestSession() {
  ensure();
  const files = fs.readdirSync(SESSION_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, files[0]), "utf-8"));
  } catch { return null; }
}

export function listSessions() {
  ensure();
  return fs.readdirSync(SESSION_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse()
    .map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8")); } catch { return null; }
    })
    .filter(Boolean);
}

export function deleteSession(id) {
  const p = path.join(SESSION_DIR, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function findToolCall(text) {
  // 1. Try extracting from ```json ... ``` blocks
  const blocks = text.match(/```(?:json)?\s*([\s\S]*?)```/gi);
  if (blocks) {
    for (const b of blocks) {
      const cleaned = b.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();
      try {
        const r = JSON.parse(cleaned);
        if (r && (r.tool || r.name)) return r;
      } catch {}
    }
  }
  // 2. Fallback: scan for balanced {...} containing "tool"
  let start = -1, depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") {
      if (start === -1) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const r = JSON.parse(text.slice(start, i + 1));
          if (r && (r.tool || r.name)) return r;
        } catch {}
        start = -1;
      }
    }
  }
  return null;
}
