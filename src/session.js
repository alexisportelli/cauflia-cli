import fs from "fs";
import path from "path";
import os from "os";

const SESSION_DIR = path.join(os.homedir(), ".config", "cauflia", "sessions");

function ensure() {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });
}

export function createSession(model) {
  ensure();
  const s = {
    id: `sess_${Date.now()}`,
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
  s.updated = new Date().toISOString();
  fs.writeFileSync(path.join(SESSION_DIR, `${s.id}.json`), JSON.stringify(s, null, 2), "utf-8");
}

export function loadLatestSession() {
  ensure();
  const files = fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json")).sort().reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, files[0]), "utf-8"));
  } catch { return null; }
}

export function listSessions() {
  ensure();
  return fs.readdirSync(SESSION_DIR).filter(f => f.endsWith(".json")).map(f => {
    try { return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8")); } catch { return null; }
  }).filter(Boolean).sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

export function deleteSession(id) {
  const p = path.join(SESSION_DIR, `${id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

export function findToolCall(text) {
  const m = text.match(/```(?:json)?\s*(\{(?:[^{}]|"(?:\\.|[^"\\])*")*\s*"tool"\s*:\s*"[^"]+"[\s\S]*?\})\s*```/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const r = text.match(/\{(?:[^{}]|"(?:\\.|[^"\\])*")*\s*"tool"\s*:\s*"[^"]+"[\s\S]*?\}/);
  if (r) { try { return JSON.parse(r[0]); } catch {} }
  return null;
}
