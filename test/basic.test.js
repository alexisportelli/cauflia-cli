import fs from "fs";
import path from "path";
import os from "os";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// ── Config ──
const { defaultConfig, loadConfig, saveConfig, parseModel, resolveApiKey, configWizard, isDangerousCommand } = await import("../src/config.js");

describe("config", () => {
  it("defaultConfig returns expected structure", () => {
    const c = defaultConfig();
    assert.equal(c.model, "gemini/gemini-1.5-flash");
    assert.ok(c.provider.gemini);
    assert.ok(c.provider.openai);
    assert.ok(c.provider.anthropic);
    assert.ok(c.provider.ollama);
    assert.equal(c.permission.execute_command, "ask");
    assert.equal(c.permission.read_file, "allow");
  });

  it("parseModel splits provider/model", () => {
    assert.deepEqual(parseModel("gemini/gemini-1.5-flash"), { provider: "gemini", model: "gemini-1.5-flash" });
    assert.deepEqual(parseModel("openai/gpt-4o"), { provider: "openai", model: "gpt-4o" });
  });

  it("parseModel falls back for bad format", () => {
    const r = parseModel("bad");
    assert.equal(r.provider, "gemini");
  });

  it("resolveApiKey checks env var first", () => {
    const cfg = defaultConfig();
    const r = resolveApiKey(cfg, "openai");
    assert.equal(r, process.env.OPENAI_API_KEY || null);
  });

  it("resolveApiKey returns null when no key", () => {
    const cfg = defaultConfig();
    assert.equal(resolveApiKey(cfg, "anthropic"), null);
  });

  it("resolveApiKey ollama returns ollama", () => {
    const cfg = defaultConfig();
    assert.equal(resolveApiKey(cfg, "ollama"), "ollama");
  });

  it("resolveApiKey falls back to GEMINI_API_KEY env var", () => {
    const orig = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "env-key-456";
    try {
      const cfg = defaultConfig();
      cfg.provider.gemini = {};
      assert.equal(resolveApiKey(cfg, "gemini"), "env-key-456");
    } finally {
      if (orig) process.env.GEMINI_API_KEY = orig; else delete process.env.GEMINI_API_KEY;
    }
  });

  it("env var takes priority over config provider key", () => {
    const orig = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "from-env";
    try {
      const cfg = defaultConfig();
      cfg.provider.openai = { apiKey: "from-config" };
      assert.equal(resolveApiKey(cfg, "openai"), "from-env");
    } finally {
      if (orig) process.env.OPENAI_API_KEY = orig; else delete process.env.OPENAI_API_KEY;
    }
  });

  it("resolveApiKey does not use GEMINI_API_KEY for non-gemini providers", () => {
    const orig = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = "should-not-leak";
    try {
      const cfg = defaultConfig();
      cfg.provider.anthropic = {};
      cfg.provider.openai = {};
      assert.equal(resolveApiKey(cfg, "anthropic"), null);
      assert.equal(resolveApiKey(cfg, "openai"), null);
    } finally {
      if (orig) process.env.GEMINI_API_KEY = orig; else delete process.env.GEMINI_API_KEY;
    }
  });

  it("isDangerousCommand blocks rm -rf /", () => {
    assert.ok(isDangerousCommand("rm -rf /"));
    assert.ok(isDangerousCommand("rm -rf /var"));
    assert.ok(!isDangerousCommand("rm file.txt"));
    assert.ok(!isDangerousCommand("ls -la"));
  });

  it("isDangerousCommand blocks format and shutdown", () => {
    assert.ok(isDangerousCommand("format C: /q"));
    assert.ok(isDangerousCommand("shutdown /s"));
    assert.ok(isDangerousCommand("halt"));
    assert.ok(isDangerousCommand("reboot"));
  });
});

// ── Session ──
const { createSession, saveSession, loadLatestSession, listSessions, deleteSession, findToolCall } = await import("../src/session.js");

describe("session", { concurrency: false }, () => {
  const SESSION_DIR = path.join(os.homedir(), ".config", "cauflia", "sessions");

  beforeEach(() => {
    if (fs.existsSync(SESSION_DIR)) fs.rmSync(SESSION_DIR, { recursive: true });
  });

  it("createSession creates and saves", () => {
    const s = createSession("test/model");
    assert.ok(s.id);
    assert.equal(s.model, "test/model");
    assert.deepEqual(s.messages, []);
    assert.ok(fs.existsSync(path.join(SESSION_DIR, `${s.id}.json`)));
  });

  it("loadLatestSession returns most recent", () => {
    const s1 = createSession("m1");
    const s2 = createSession("m2");
    const latest = loadLatestSession();
    assert.equal(latest.id, s2.id);
  });

  it("listSessions returns sorted by updated desc", () => {
    const s1 = createSession("m1");
    const s2 = createSession("m2");
    const list = listSessions();
    assert.equal(list.length, 2);
    assert.equal(list[0].id, s2.id);
  });

  it("deleteSession removes file", () => {
    const s = createSession("m");
    deleteSession(s.id);
    assert.ok(!fs.existsSync(path.join(SESSION_DIR, `${s.id}.json`)));
  });

  it("findToolCall parses JSON in code block", () => {
    const text = 'du texte\n```json\n{ "tool": "read_file", "arguments": { "path": "x" } }\n```\nsuite';
    const r = findToolCall(text);
    assert.ok(r);
    assert.equal(r.tool, "read_file");
    assert.equal(r.arguments.path, "x");
  });

  it("findToolCall returns null when no tool", () => {
    const r = findToolCall("just some text");
    assert.equal(r, null);
  });

  it("findToolCall parses multiline JSON", () => {
    const text = '```json\n{\n  "tool": "write_file",\n  "arguments": {\n    "path": "/tmp/f",\n    "content": "hello"\n  }\n}\n```';
    const r = findToolCall(text);
    assert.ok(r);
    assert.equal(r.tool, "write_file");
    assert.equal(r.arguments.content, "hello");
  });

  it("findToolCall parses JSON without code fences", () => {
    const text = 'du texte { "tool": "read_file", "arguments": { "path": "x" } } suite';
    const r = findToolCall(text);
    assert.ok(r);
    assert.equal(r.tool, "read_file");
  });

  it("findToolCall parses tool name field", () => {
    const text = '```json\n{ "name": "execute_command", "args": { "command": "ls" } }\n```';
    const r = findToolCall(text);
    assert.ok(r);
    assert.equal(r.name, "execute_command");
  });
});

// ── Tools ──
const { executeTool, checkPermission, TOOL_NAMES } = await import("../src/tools.js");

describe("tools", () => {
  it("TOOL_NAMES has all 8 tools", () => {
    assert.equal(TOOL_NAMES.length, 8);
    assert.ok(TOOL_NAMES.includes("execute_command"));
    assert.ok(TOOL_NAMES.includes("read_file"));
    assert.ok(TOOL_NAMES.includes("write_file"));
    assert.ok(TOOL_NAMES.includes("list_directory"));
    assert.ok(TOOL_NAMES.includes("generate_video"));
    assert.ok(TOOL_NAMES.includes("download_youtube"));
    assert.ok(TOOL_NAMES.includes("edit_video"));
    assert.ok(TOOL_NAMES.includes("manage_library"));
  });

  it("checkPermission defaults to ask", () => {
    const cfg = { permission: {} };
    assert.equal(checkPermission(cfg, "unknown_tool"), "ask");
  });

  it("checkPermission reads from config", () => {
    const cfg = { permission: { execute_command: "deny" } };
    assert.equal(checkPermission(cfg, "execute_command"), "deny");
  });

  it("executeTool read_file returns not found for bad path", async () => {
    const r = await executeTool("read_file", { path: "/nonexistent/path/12345" }, defaultConfig());
    assert.equal(r.success, false);
    assert.ok(r.error);
  });

  it("executeTool list_directory works on existing dir", async () => {
    const r = await executeTool("list_directory", { path: "." }, defaultConfig());
    assert.equal(r.success, true);
    assert.ok(Array.isArray(r.files));
  });

  it("executeTool write_file creates file", async () => {
    const tmp = path.join(os.tmpdir(), `cauflia_test_${Date.now()}.txt`);
    const r = await executeTool("write_file", { path: tmp, content: "hello test" }, defaultConfig());
    assert.equal(r.success, true);
    assert.equal(fs.readFileSync(tmp, "utf-8"), "hello test");
    fs.unlinkSync(tmp);
  });

  it("executeTool invalid tool returns error", async () => {
    const r = await executeTool("nonexistent", {}, defaultConfig());
    assert.equal(r.success, false);
    assert.ok(r.error.includes("inconnu"));
  });

  it("executeTool dangerous command is blocked", async () => {
    const r = await executeTool("execute_command", { command: "rm -rf /" }, defaultConfig());
    assert.equal(r.success, false);
    assert.ok(r.error.includes("dangereux"));
  });

  it("executeTool empty command returns error", async () => {
    const r = await executeTool("execute_command", {}, defaultConfig());
    assert.equal(r.success, false);
    assert.ok(r.error.includes("Aucune commande"));
  });

  it("executeTool edit_video missing inputs returns error", async () => {
    const r = await executeTool("edit_video", {}, defaultConfig());
    assert.equal(r.success, false);
    assert.ok(r.error.includes("inputs"));
  });

  it("executeTool read_file returns truncated flag for large content", async () => {
    const big = "a".repeat(60000);
    const tmp = path.join(os.tmpdir(), `cauflia_test_large_${Date.now()}.txt`);
    fs.writeFileSync(tmp, big, "utf-8");
    const r = await executeTool("read_file", { path: tmp }, defaultConfig());
    assert.equal(r.success, true);
    assert.ok(r.truncated);
    assert.ok(r.content.length < 51000);
    fs.unlinkSync(tmp);
  });
});

// ── Providers (mock stream) ──
describe("providers (dry-run)", () => {
  it("streamChat with unknown provider throws", async () => {
    const { streamChat } = await import("../src/providers.js");
    try {
      for await (const _ of streamChat("unknown_provider", {}, [])) {}
      assert.fail("should have thrown");
    } catch (e) {
      assert.ok(e.message.includes("inconnu"));
    }
  });
});


