import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { assembleVideo } from "./video-generator.js";
import * as editor from "./video-editor.js";
import * as library from "./media-library.js";
import { downloadYouTube, getInfo } from "./youtube.js";

export const TOOLS = [
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Exécute une commande shell dans le répertoire de travail. Utile pour lancer des scripts, installer des packages, exécuter des tests, etc.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Commande shell exacte à exécuter" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Lit le contenu textuel d'un fichier sur le disque.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin absolu ou relatif du fichier" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Écrit ou écrase un fichier avec le contenu fourni.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du fichier" },
          content: { type: "string", description: "Contenu à écrire" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "Liste les fichiers et dossiers d'un répertoire.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Chemin du dossier (défaut: .)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_video",
      description: "Génère une stratégie marketing et une vidéo courte (TikTok/Reels/Shorts) à partir d'un sujet. Utilise l'IA pour le script, la voix-off TTS, les gradients et la musique.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Le sujet ou produit de la vidéo" },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "download_youtube",
      description: "Télécharge une vidéo ou l'audio depuis YouTube.",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "URL YouTube" },
          audio: { type: "boolean", description: "Si true, télécharge uniquement l'audio MP3" },
          quality: { type: "string", description: "Qualité: best, 1080, 720, 480 (défaut: best)" },
          clip: { type: "string", description: "Extrait, ex: '10-30'" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_video",
      description: "Édite une vidéo : trim, concat, speed, resize, crop, overlay, audio, effets.",
      parameters: {
        type: "object",
        properties: {
          inputs: { type: "array", items: { type: "string" }, description: "Fichiers vidéo d'entrée" },
          output: { type: "string", description: "Fichier de sortie (optionnel)" },
          trim: { type: "string", description: "Extrait début-fin, ex: '5-15'" },
          concat: { type: "boolean", description: "Concaténer les entrées" },
          speed: { type: "number", description: "Facteur de vitesse, ex: 1.5, 2.0" },
          resize: { type: "string", description: "Dimensions, ex: '1080x1920'" },
          crop: { type: "string", description: "Rognage, ex: 'w:h:x:y'" },
          text: { type: "string", description: "Texte à superposer" },
          overlay: { type: "string", description: "Image à superposer" },
          audio: { type: "string", description: "Piste audio à mixer" },
          replaceAudio: { type: "string", description: "Remplacer l'audio" },
          extractAudio: { type: "boolean", description: "Extraire l'audio en MP3" },
          gradient: { type: "string", description: "Style: sunset, ocean, cyberpunk, velvet" },
          vignette: { type: "boolean", description: "Effet vignette" },
          grain: { type: "boolean", description: "Effet grain cinéma" },
        },
        required: ["inputs"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "manage_library",
      description: "Gère la médiathèque locale (stats, liste, import, ouverture dossier).",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["stats", "list", "import", "open"], description: "Action à effectuer" },
          type: { type: "string", enum: ["videos", "images", "audio"], description: "Type de média" },
          path: { type: "string", description: "Chemin du fichier à importer" },
        },
        required: ["action"],
      },
    },
  },
];

export async function executeTool(name, args, config) {
  switch (name) {
    case "execute_command": {
      try {
        const stdout = execSync(args.command, {
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 120000,
        });
        return { success: true, stdout };
      } catch (err) {
        return {
          success: false,
          error: err.message,
          stdout: err.stdout?.toString() || "",
          stderr: err.stderr?.toString() || "",
        };
      }
    }

    case "read_file": {
      try {
        const resolved = path.resolve(args.path);
        if (!fs.existsSync(resolved)) return { success: false, error: `Fichier introuvable: ${resolved}` };
        const stat = fs.statSync(resolved);
        if (stat.isDirectory()) return { success: false, error: `${resolved} est un dossier` };
        const content = fs.readFileSync(resolved, "utf-8");
        if (content.length > 50000) {
          return { success: true, truncated: true, content: content.slice(0, 50000) + "\n\n...[TRONQUÉ]..." };
        }
        return { success: true, content };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case "write_file": {
      try {
        const resolved = path.resolve(args.path);
        const parent = path.dirname(resolved);
        if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
        fs.writeFileSync(resolved, args.content, "utf-8");
        return { success: true, message: `Fichier écrit: ${resolved}` };
      } catch (err) {
        return { success: false, error: err.message };
      }
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
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case "generate_video": {
      try {
        const exportsDir = library.getDir("exports");
        const output = path.join(exportsDir, `cauflia_${Date.now()}.mp4`);
        const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const instruction = `Génère un JSON de scènes vidéo. Tout en français. Format vertical 9:16.
        voiceover_text: max 25 mots par scène. text_overlay: max 8 mots.
        music_style: lofi, synthwave, ou cinematic. mood par scène: sunset, ocean, cyberpunk, ou velvet.
        Retourne STRICTEMENT ce JSON:
        { "title": "...", "music_style": "...", "scenes": [{ "title": "...", "mood": "...", "text_overlay": "...", "voiceover_text": "..." }] }`;

        const res = await model.generateContent([instruction, `Sujet: ${args.prompt}`]);
        let json = res.response.text().trim();
        if (json.startsWith("\`\`\`json")) json = json.slice(7);
        if (json.endsWith("\`\`\`")) json = json.slice(0, -3);
        const data = JSON.parse(json.trim());
        const result = await assembleVideo(data.scenes, "cinematic", data.music_style, output);
        return { success: true, filePath: result.filePath, duration: result.duration, title: data.title };
      } catch (err) {
        return { success: false, error: err.message };
      }
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
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case "edit_video": {
      try {
        const expDir = library.getDir("exports");
        let input = path.resolve(args.inputs[0]);
        const outPath = args.output ? path.resolve(args.output) : path.join(expDir, `edit_${Date.now()}.mp4`);

        const chain = (fn, ...params) => {
          const tmp = path.join(expDir, `tmp_${Date.now()}.mp4`);
          fn(input, tmp, ...params);
          input = tmp;
        };

        if (args.trim) {
          const [s, e] = args.trim.split("-").map(Number);
          chain(editor.trimClip, s, (e || s + 10) - s);
        }
        if (args.concat && args.inputs.length > 1) {
          const tmp = path.join(expDir, `concat_${Date.now()}.mp4`);
          editor.concatClips(args.inputs.map(i => path.resolve(i)), tmp);
          input = tmp;
        }
        if (args.speed) chain(editor.changeSpeed, args.speed);
        if (args.resize) {
          const [w, h] = args.resize.split("x").map(Number);
          chain(editor.resizeClip, w, h);
        }
        if (args.crop) chain(editor.cropClip, args.crop);
        if (args.text) chain(editor.addTextOverlay, args.text);
        if (args.overlay) {
          const tmp = path.join(expDir, `ov_${Date.now()}.mp4`);
          editor.overlayImage(input, path.resolve(args.overlay), tmp);
          input = tmp;
        }
        if (args.gradient) chain(editor.addGradientOverlay, args.gradient);
        if (args.vignette) chain(editor.addVignette);
        if (args.grain) chain(editor.addFilmGrain);
        if (args.audio) {
          const tmp = path.join(expDir, `mix_${Date.now()}.mp4`);
          editor.mixAudio(input, path.resolve(args.audio), tmp);
          input = tmp;
        }
        if (args.replaceAudio) {
          const tmp = path.join(expDir, `re_${Date.now()}.mp4`);
          editor.replaceAudio(input, path.resolve(args.replaceAudio), tmp);
          input = tmp;
        }
        if (args.extractAudio) {
          const audioPath = outPath.replace(/\.\w+$/, ".mp3");
          editor.extractAudio(input, audioPath);
          return { success: true, filePath: audioPath };
        }
        if (input !== outPath) fs.copyFileSync(input, outPath);
        return { success: true, filePath: outPath };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    case "manage_library": {
      try {
        switch (args.action) {
          case "stats": {
            const stats = library.getLibraryStats();
            return { success: true, stats };
          }
          case "list": {
            const files = library.listOnDisk(args.type);
            return { success: true, files };
          }
          case "import": {
            const dest = library.addMedia(path.resolve(args.path), args.type);
            return { success: true, destination: dest };
          }
          case "open": {
            const stats = library.getLibraryStats();
            execSync(`explorer "${stats.studioDir}"`, { stdio: "ignore" });
            return { success: true, message: "Dossier ouvert" };
          }
          default:
            return { success: false, error: `Action inconnue: ${args.action}` };
        }
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    default:
      return { success: false, error: `Outil inconnu: ${name}` };
  }
}
