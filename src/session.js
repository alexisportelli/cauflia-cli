import fs from "fs";
import path from "path";
import os from "os";

const SESSION_DIR = path.join(os.homedir(), ".config", "cauflia", "sessions");

function ensureDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

export function createSession(provider, model) {
  ensureDir();
  const session = {
    id: `session_${Date.now()}`,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    provider,
    model,
    messages: [],
  };
  saveSession(session);
  return session;
}

export function saveSession(session) {
  ensureDir();
  session.updated = new Date().toISOString();
  fs.writeFileSync(
    path.join(SESSION_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
    "utf-8"
  );
}

export function loadLatestSession() {
  ensureDir();
  const files = fs
    .readdirSync(SESSION_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, files[0]), "utf-8"));
  } catch {
    return null;
  }
}

export function listSessions() {
  ensureDir();
  return fs
    .readdirSync(SESSION_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), "utf-8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));
}

export function findToolCall(text) {
  const blockRegex = /```(?:json)?\s*(\{\s*"tool"[\s\S]*?\})\s*```/gi;
  const m = blockRegex.exec(text);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {}
  }

  const rawRegex = /(\{\s*"tool"\s*:\s*"[^"]+"[\s\S]*?\})/gi;
  let r;
  while ((r = rawRegex.exec(text)) !== null) {
    try {
      return JSON.parse(r[1]);
    } catch {}
  }
  return null;
}
