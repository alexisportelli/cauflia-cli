import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { assembleVideo } from "./video-generator.js";
import * as editor from "./video-editor.js";
import * as library from "./media-library.js";
import { downloadYouTube, getInfo } from "./youtube.js";

export const TOOL_NAMES = [
  "execute_command", "read_file", "write_file", "list_directory",
  "generate_video", "download_youtube", "edit_video", "manage_library",
];

export function checkPermission(config, toolName) {
  const p = config.permission?.[toolName];
  return p || "ask";
}

export async function executeTool(name, args, config) {
  switch (name) {
    case "execute_command": {
      try {
        const stdout = execSync(args.command, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
        return { success: true, stdout };
      } catch (err) {
        return { success: false, error: err.message, stdout: err.stdout?.toString() || "", stderr: err.stderr?.toString() || "" };
      }
    }
    case "read_file": {
      try {
        const resolved = path.resolve(args.path);
        if (!fs.existsSync(resolved)) return { success: false, error: `Fichier introuvable: ${resolved}` };
        if (fs.statSync(resolved).isDirectory()) return { success: false, error: `${resolved} est un dossier` };
        let content = fs.readFileSync(resolved, "utf-8");
        if (content.length > 50000) content = content.slice(0, 50000) + "\n\n...[TRONQUÉ]...";
        return { success: true, content };
      } catch (err) { return { success: false, error: err.message }; }
    }
    case "write_file": {
      try {
        const resolved = path.resolve(args.path);
        const parent = path.dirname(resolved);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(resolved, args.content, "utf-8");
        return { success: true, message: `Écrit: ${resolved}` };
      } catch (err) { return { success: false, error: err.message }; }
    }
    case "list_directory": {
      try {
        const resolved = path.resolve(args.path || ".");
        if (!fs.existsSync(resolved)) return { success: false, error: `Dossier introuvable: ${resolved}` };
        if (!fs.statSync(resolved).isDirectory()) return { success: false, error: `${resolved} n'est pas un dossier` };
        const files = fs.readdirSync(resolved).map(f => {
          const full = path.join(resolved, f);
          const s = fs.statSync(full);
          return { name: f, isDirectory: s.isDirectory(), size: s.isDirectory() ? 0 : s.size, modified: s.mtime };
        });
        return { success: true, files: files.slice(0, 200) };
      } catch (err) { return { success: false, error: err.message }; }
    }
    case "generate_video": {
      try {
        const geminiKey = config.provider?.gemini?.apiKey;
        if (!geminiKey) return { success: false, error: "Clé Gemini requise pour generate_video" };
        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const inst = `Génère un JSON de scènes vidéo. Tout en français. Format vertical 9:16.
voiceover_text: max 25 mots. text_overlay: max 8 mots.
music_style: lofi, synthwave, cinematic. mood: sunset, ocean, cyberpunk, velvet.
JSON: { "title": "...", "music_style": "...", "scenes": [{ "title": "...", "mood": "...", "text_overlay": "...", "voiceover_text": "..." }] }`;
        const res = await model.generateContent([inst, `Sujet: ${args.prompt}`]);
        let json = res.response.text().trim();
        if (json.startsWith("```json")) json = json.slice(7);
        if (json.endsWith("```")) json = json.slice(0, -3);
        const data = JSON.parse(json.trim());
        const out = path.join(library.getDir("exports"), `cauflia_${Date.now()}.mp4`);
        const result = await assembleVideo(data.scenes, "cinematic", data.music_style, out);
        return { success: true, filePath: result.filePath, duration: result.duration, title: data.title };
      } catch (err) { return { success: false, error: err.message }; }
    }
    case "download_youtube": {
      try {
        const info = await getInfo(args.url);
        const result = await downloadYouTube(args.url, {
          type: args.audio ? "audio" : "video",
          quality: args.quality || "best",
          outputName: `yt_${Date.now()}`,
        });
        return { success: true, title: info.title, filePath: result.path };
      } catch (err) { return { success: false, error: err.message }; }
    }
    case "edit_video": {
      try {
        const exp = library.getDir("exports");
        let input = path.resolve(args.inputs[0]);
        const outPath = args.output ? path.resolve(args.output) : path.join(exp, `edit_${Date.now()}.mp4`);
        const tmp = () => path.join(exp, `tmp_${Date.now()}.mp4`);

        if (args.trim) { const [s, e] = args.trim.split("-").map(Number); const o = tmp(); editor.trimClip(input, o, s, (e || s + 10) - s); input = o; }
        if (args.concat && args.inputs.length > 1) { const o = tmp(); editor.concatClips(args.inputs.map(i => path.resolve(i)), o); input = o; }
        if (args.speed) { const o = tmp(); editor.changeSpeed(input, o, args.speed); input = o; }
        if (args.resize) { const [w, h] = args.resize.split("x").map(Number); const o = tmp(); editor.resizeClip(input, o, w, h); input = o; }
        if (args.crop) { const o = tmp(); editor.cropClip(input, o, args.crop); input = o; }
        if (args.text) { const o = tmp(); editor.addTextOverlay(input, o, args.text); input = o; }
        if (args.overlay) { const o = tmp(); editor.overlayImage(input, path.resolve(args.overlay), o); input = o; }
        if (args.gradient) { const o = tmp(); editor.addGradientOverlay(input, o, args.gradient); input = o; }
        if (args.vignette) { const o = tmp(); editor.addVignette(input, o); input = o; }
        if (args.grain) { const o = tmp(); editor.addFilmGrain(input, o); input = o; }
        if (args.audio) { const o = tmp(); editor.mixAudio(input, path.resolve(args.audio), o); input = o; }
        if (args.replaceAudio) { const o = tmp(); editor.replaceAudio(input, path.resolve(args.replaceAudio), o); input = o; }
        if (args.extractAudio) { const audioPath = outPath.replace(/\.\w+$/, ".mp3"); editor.extractAudio(input, audioPath); return { success: true, filePath: audioPath }; }
        if (input !== outPath) fs.copyFileSync(input, outPath);
        return { success: true, filePath: outPath };
      } catch (err) { return { success: false, error: err.message }; }
    }
    case "manage_library": {
      try {
        switch (args.action) {
          case "stats": return { success: true, stats: library.getLibraryStats() };
          case "list": return { success: true, files: library.listOnDisk(args.type) };
          case "import": return { success: true, destination: library.addMedia(path.resolve(args.path), args.type) };
          case "open": { execSync(`explorer "${library.getLibraryStats().studioDir}"`, { stdio: "ignore" }); return { success: true, message: "Dossier ouvert" }; }
          default: return { success: false, error: `Action inconnue: ${args.action}` };
        }
      } catch (err) { return { success: false, error: err.message }; }
    }
    default: return { success: false, error: `Outil inconnu: ${name}` };
  }
}
