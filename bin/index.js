#!/usr/bin/env node

import { Command } from "commander";
import * as p from "@clack/prompts";
import pc from "picocolors";
import fs from "fs";
import path from "path";
import os from "os";
import { runAgent } from "../src/agent.js";
import { downloadYouTube, getInfo } from "../src/youtube.js";
import * as editor from "../src/video-editor.js";
import * as library from "../src/media-library.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "cauflia");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

// ═══════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════

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

function formatSize(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(2)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function showBanner() {
  console.log("");
  console.log(pc.bold(pc.hex("#6366f1")("    ╔═══════════════════════════════════════════╗")));
  console.log(pc.bold(pc.hex("#a855f7")("    ║           ") + pc.bold(pc.hex("#ec4899")("CAUFLIA CLI v1.0")) + pc.bold(pc.hex("#a855f7")("          ║")));
  console.log(pc.bold(pc.hex("#6366f1")("    ╚═══════════════════════════════════════════╝")));
  console.log(pc.dim("    L'agent autonome de création vidéo — mode local & SaaS"));
  console.log("");
}

// ═══════════════════════════════════════════════════
// PROGRAM
// ═══════════════════════════════════════════════════

const program = new Command();

program
  .name("cauflia")
  .description(pc.hex("#a855f7")("Cauflia CLI — Agent autonome de création vidéo"))
  .version("1.0.0");

// ═══════════════════════════════════════════════════
// GENERATE (default)
// ═══════════════════════════════════════════════════

program
  .argument("[prompt...]", "Description de ton projet pour générer stratégie et vidéo")
  .action(async (promptArgs) => {
    const config = loadConfig();
    const joinedPrompt = promptArgs ? promptArgs.join(" ") : "";

    showBanner();

    // Check Gemini key
    if (!config.GEMINI_API_KEY) {
      p.note(
        "Configure ta clé API Google Gemini pour utiliser l'agent.",
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

    let finalPrompt = joinedPrompt;
    if (!finalPrompt) {
      const input = await p.text({
        message: pc.hex("#6366f1")("Que veux-tu créer ?"),
        placeholder: "Ex: un TikTok sur le café de spécialité",
        validate: (v) => { if (!v) return "Le prompt est requis"; },
      });

      if (p.isCancel(input)) { p.outro(pc.yellow("À bientôt !")); process.exit(0); }
      finalPrompt = input;
    }

    try {
      await runAgent(finalPrompt, config);
    } catch (err) {
      p.log.error(pc.red(`Erreur: ${err.message || err}`));
    }

    p.outro(pc.green("✔ Travail terminé."));
  });

// ═══════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════
// DOWNLOAD
// ═══════════════════════════════════════════════════

program
  .command("download")
  .description("Télécharger une vidéo ou audio depuis YouTube")
  .argument("<url>", "URL de la vidéo YouTube")
  .option("-a, --audio", "Télécharger uniquement l'audio (MP3)")
  .option("-q, --quality <q>", "Qualité vidéo (best, 1080, 720, 480)", "best")
  .option("-c, --clip <range>", "Extraire un clip (format: debut-fin, ex: 10-30)")
  .action(async (url, options) => {
    showBanner();
    console.log(pc.bold(pc.hex("#a855f7")(`  Téléchargement : ${url}`)));
    console.log("");

    const s = p.spinner();
    s.start(pc.hex("#a855f7")("Récupération des informations..."));

    try {
      const info = await getInfo(url);
      s.stop(pc.green(`✔ ${info.title || "Vidéo trouvée"}`));

      console.log(`    ${pc.dim("Titre :")}    ${info.title}`);
      console.log(`    ${pc.dim("Durée :")}    ${formatDuration(info.duration)}`);
      console.log(`    ${pc.dim("Chaîne :")}   ${info.uploader}`);
      console.log("");

      let clipStart = null, clipEnd = null;
      if (options.clip) {
        const parts = options.clip.split("-");
        clipStart = parseFloat(parts[0]);
        clipEnd = parts[1] ? parseFloat(parts[1]) : clipStart + 30;
        console.log(`    ${pc.dim("Clip :")}    ${clipStart}s → ${clipEnd}s`);
        console.log("");
      }

      s.start(pc.hex("#a855f7")(`Téléchargement ${options.audio ? "audio" : "vidéo"}...`));

      const type = options.audio ? "audio" : "video";
      const quality = options.quality;

      const result = await downloadYouTube(url, {
        type,
        quality,
        clipStart,
        clipEnd,
        outputName: `yt_${Date.now()}`,
      });

      s.stop(pc.green("✔ Téléchargement terminé !"));

      const stats = fs.statSync(result.path);
      console.log("");
      console.log(`  ${pc.green("✔")} ${pc.bold("Fichier sauvegardé :")}`);
      console.log(`    ${pc.dim("Chemin :")} ${result.path}`);
      console.log(`    ${pc.dim("Taille :")} ${formatSize(stats.size)}`);
      console.log("");

      p.outro(pc.green("✔ Terminé."));
    } catch (err) {
      s.stop(pc.red("✖ Erreur"));
      p.log.error(pc.red(err.message || String(err)));
    }
  });

// ═══════════════════════════════════════════════════
// LIBRARY
// ═══════════════════════════════════════════════════

program
  .command("library")
  .description("Gérer la médiathèque locale")
  .option("-l, --list <type>", "Lister les fichiers (videos, images, audio)")
  .option("-i, --import <path>", "Importer un fichier dans la médiathèque")
  .option("-t, --type <type>", "Type pour l'import (videos, images, audio)", "videos")
  .option("-s, --stats", "Afficher les statistiques")
  .option("--open", "Ouvrir le dossier de la médiathèque")
  .action(async (options) => {
    showBanner();

    if (options.stats) {
      const stats = library.getLibraryStats();
      console.log(pc.bold(pc.hex("#a855f7")("  Médiathèque Cauflia")));
      console.log(`    ${pc.dim("Dossier :")} ${stats.studioDir}`);
      console.log("");
      console.log(`    ${pc.dim("Vidéos :")}  ${stats.videos.length} fichiers`);
      console.log(`    ${pc.dim("Images :")}  ${stats.images.length} fichiers`);
      console.log(`    ${pc.dim("Audio :")}   ${stats.audio.length} fichiers`);
      console.log(`    ${pc.dim("Exports :")} ${stats.projects.length} fichiers`);
      console.log(`    ${pc.dim("Total :")}   ${formatSize(stats.totalSize)}`);
      console.log("");
      return;
    }

    if (options.list) {
      const type = options.list;
      const files = library.listOnDisk(type);

      if (files.length === 0) {
        console.log(`  ${pc.dim(`Aucun fichier ${type} dans la médiathèque.`)}`);
        console.log(`  ${pc.dim(`Importe avec : cauflia library -i <fichier> -t ${type}`)}`);
        console.log("");
        return;
      }

      console.log(pc.bold(pc.hex("#a855f7")(`  ${files.length} fichier(s) ${type}`)));
      console.log("");

      files.forEach((f, i) => {
        const num = `${i + 1}`.padStart(3);
        console.log(`  ${pc.dim(num + ".")} ${pc.bold(f.name)}`);
        console.log(`       ${pc.dim("Taille :")} ${formatSize(f.size)}  ${pc.dim("Modifié :")} ${f.modified.toLocaleDateString()}`);
      });
      console.log("");
      return;
    }

    if (options.import) {
      const sourcePath = path.resolve(options.import);
      if (!fs.existsSync(sourcePath)) {
        p.log.error(pc.red("Fichier introuvable."));
        return;
      }

      const dest = library.addMedia(sourcePath, options.type);
      console.log(`  ${pc.green("✔")} Fichier importé : ${pc.bold(path.basename(dest))}`);
      console.log(`    ${pc.dim("Dossier :")} ${path.dirname(dest)}`);
      console.log("");
      return;
    }

    if (options.open) {
      const stats = library.getLibraryStats();
      console.log(`  ${pc.dim("Ouverture du dossier :")} ${stats.studioDir}`);
      console.log("");
      try {
        const { execSync } = await import("child_process");
        execSync(`explorer "${stats.studioDir}"`, { stdio: "ignore" });
      } catch {
        console.log(`  ${pc.yellow("Ouvre manuellement :")} ${stats.studioDir}`);
      }
      return;
    }

    // Default: show stats
    const stats = library.getLibraryStats();
    console.log(pc.bold(pc.hex("#a855f7")("  Médiathèque Cauflia")));
    console.log(`    ${pc.dim("Dossier :")} ${stats.studioDir}`);
    console.log("");
    console.log(`    ${pc.dim("Vidéos :")}  ${stats.videos.length} fichiers`);
    console.log(`    ${pc.dim("Images :")}  ${stats.images.length} fichiers`);
    console.log(`    ${pc.dim("Audio :")}   ${stats.audio.length} fichiers`);
    console.log(`    ${pc.dim("Exports :")} ${stats.projects.length} fichiers`);
    console.log(`    ${pc.dim("Total :")}   ${formatSize(stats.totalSize)}`);
    console.log("");
    console.log(`  ${pc.dim("Commandes :")}`);
    console.log(`    ${pc.dim("cauflia library -l videos    ")} Lister les vidéos`);
    console.log(`    ${pc.dim("cauflia library -i video.mp4 -t videos")} Importer un fichier`);
    console.log(`    ${pc.dim("cauflia library --open       ")} Ouvrir le dossier`);
    console.log("");
  });

// ═══════════════════════════════════════════════════
// EDIT
// ═══════════════════════════════════════════════════

program
  .command("edit")
  .description("Éditer une vidéo (trim, concat, overlay, etc.)")
  .argument("<input...>", "Fichier(s) vidéo d'entrée")
  .option("-o, --output <path>", "Fichier de sortie")
  .option("--trim <range>", "Couper un extrait (début-fin, ex: 5-15)")
  .option("--concat", "Concaténer plusieurs fichiers")
  .option("--speed <factor>", "Changer la vitesse (ex: 2 pour x2)")
  .option("--resize <dim>", "Redimensionner (ex: 1080x1920)")
  .option("--crop <crop>", "Cropper (w:h:x:y)")
  .option("--text <text>", "Ajouter un texte")
  .option("--overlay <image>", "Superposer une image")
  .option("--audio <file>", "Mixer un fichier audio")
  .option("--replace-audio <file>", "Remplacer l'audio")
  .option("--extract-audio", "Extraire l'audio")
  .option("--gradient <mood>", "Ajouter un gradient (sunset, ocean, cyberpunk, velvet)")
  .option("--vignette", "Ajouter un effet vignette")
  .option("--grain", "Ajouter un effet grain cinéma")
  .option("--info", "Afficher les infos du fichier")
  .action(async (inputs, options) => {
    showBanner();

    // Show info
    if (options.info) {
      inputs.forEach((input) => {
        const p = path.resolve(input);
        if (!fs.existsSync(p)) {
          console.log(pc.red(`  ✖ Fichier introuvable: ${input}`));
          return;
        }
        const info = editor.getMediaInfo(p);
        if (!info) {
          console.log(pc.red(`  ✖ Impossible de lire: ${input}`));
          return;
        }
        const dur = editor.getDuration(p);
        const res = editor.getResolution(p);
        const size = fs.statSync(p).size;

        console.log(pc.bold(pc.hex("#a855f7")(`  ${path.basename(p)}`)));
        console.log(`    ${pc.dim("Durée :")}     ${formatDuration(dur)}`);
        console.log(`    ${pc.dim("Résolution :")} ${res}`);
        console.log(`    ${pc.dim("Taille :")}    ${formatSize(size)}`);
        console.log(`    ${pc.dim("Format :")}    ${info.format?.format_name || "--"}`);
        console.log("");
      });
      return;
    }

    // Operations
    const resolvedInputs = inputs.map((i) => path.resolve(i));
    for (const inp of resolvedInputs) {
      if (!fs.existsSync(inp)) {
        p.log.error(pc.red(`Fichier introuvable: ${inp}`));
        process.exit(1);
      }
    }

    const hasVideoOps = options.trim || options.concat || options.speed ||
      options.resize || options.crop || options.text || options.overlay ||
      options.gradient || options.vignette || options.grain;

    const hasAudioOps = options.audio || options.replaceAudio || options.extractAudio;

    if (!hasVideoOps && !hasAudioOps) {
      console.log(pc.yellow("  Aucune opération spécifiée."));
      console.log(pc.dim("  Exemple : cauflia edit video.mp4 --trim 5-15 -o clip.mp4"));
      console.log(pc.dim("  Voir : cauflia edit --help"));
      console.log("");
      return;
    }

    const s = p.spinner();
    const exportsDir = library.getDir("exports");
    let currentInput = resolvedInputs[0];
    let outputPath = options.output
      ? path.resolve(options.output)
      : path.join(exportsDir, `edit_${Date.now()}.mp4`);

    try {
      // TRIM
      if (options.trim) {
        s.start(pc.hex("#a855f7")("Découpage de l'extrait..."));
        const parts = options.trim.split("-");
        const start = parseFloat(parts[0]);
        const end = parts[1] ? parseFloat(parts[1]) : start + 10;
        const tempOutput = path.join(exportsDir, `trim_${Date.now()}.mp4`);
        editor.trimClip(currentInput, tempOutput, start, end - start);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Découpage terminé."));
      }

      // CONCAT
      if (options.concat && resolvedInputs.length > 1) {
        s.start(pc.hex("#a855f7")("Concaténation des fichiers..."));
        const tempOutput = path.join(exportsDir, `concat_${Date.now()}.mp4`);
        editor.concatClips(resolvedInputs, tempOutput);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Concaténation terminée."));
      }

      // SPEED
      if (options.speed) {
        s.start(pc.hex("#a855f7")(`Changement de vitesse x${options.speed}...`));
        const tempOutput = path.join(exportsDir, `speed_${Date.now()}.mp4`);
        editor.changeSpeed(currentInput, tempOutput, parseFloat(options.speed));
        currentInput = tempOutput;
        s.stop(pc.green("✔ Changement de vitesse terminé."));
      }

      // RESIZE
      if (options.resize) {
        s.start(pc.hex("#a855f7")(`Redimensionnement à ${options.resize}...`));
        const parts = options.resize.split("x");
        const tempOutput = path.join(exportsDir, `resize_${Date.now()}.mp4`);
        editor.resizeClip(currentInput, tempOutput, parseInt(parts[0]), parseInt(parts[1]));
        currentInput = tempOutput;
        s.stop(pc.green("✔ Redimensionnement terminé."));
      }

      // CROP
      if (options.crop) {
        s.start(pc.hex("#a855f7")(`Crop: ${options.crop}...`));
        const tempOutput = path.join(exportsDir, `crop_${Date.now()}.mp4`);
        editor.cropClip(currentInput, tempOutput, options.crop);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Crop terminé."));
      }

      // TEXT
      if (options.text) {
        s.start(pc.hex("#a855f7")("Ajout du texte..."));
        const tempOutput = path.join(exportsDir, `text_${Date.now()}.mp4`);
        editor.addTextOverlay(currentInput, tempOutput, options.text);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Texte ajouté."));
      }

      // OVERLAY
      if (options.overlay) {
        s.start(pc.hex("#a855f7")("Superposition de l'image..."));
        const tempOutput = path.join(exportsDir, `overlay_${Date.now()}.mp4`);
        editor.overlayImage(currentInput, path.resolve(options.overlay), tempOutput);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Image superposée."));
      }

      // GRADIENT
      if (options.gradient) {
        s.start(pc.hex("#a855f7")(`Ajout du gradient ${options.gradient}...`));
        const tempOutput = path.join(exportsDir, `gradient_${Date.now()}.mp4`);
        editor.addGradientOverlay(currentInput, tempOutput, options.gradient);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Gradient ajouté."));
      }

      // VIGNETTE
      if (options.vignette) {
        s.start(pc.hex("#a855f7")("Ajout de l'effet vignette..."));
        const tempOutput = path.join(exportsDir, `vignette_${Date.now()}.mp4`);
        editor.addVignette(currentInput, tempOutput);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Effet vignette ajouté."));
      }

      // GRAIN
      if (options.grain) {
        s.start(pc.hex("#a855f7")("Ajout du grain cinéma..."));
        const tempOutput = path.join(exportsDir, `grain_${Date.now()}.mp4`);
        editor.addFilmGrain(currentInput, tempOutput);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Grain cinéma ajouté."));
      }

      // AUDIO MIX
      if (options.audio) {
        s.start(pc.hex("#a855f7")("Mixage audio..."));
        const tempOutput = path.join(exportsDir, `audio_${Date.now()}.mp4`);
        editor.mixAudio(currentInput, path.resolve(options.audio), tempOutput);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Audio mixé."));
      }

      // REPLACE AUDIO
      if (options.replaceAudio) {
        s.start(pc.hex("#a855f7")("Remplacement de l'audio..."));
        const tempOutput = path.join(exportsDir, `reaudio_${Date.now()}.mp4`);
        editor.replaceAudio(currentInput, path.resolve(options.replaceAudio), tempOutput);
        currentInput = tempOutput;
        s.stop(pc.green("✔ Audio remplacé."));
      }

      // EXTRACT AUDIO
      if (options.extractAudio) {
        const audioPath = outputPath.replace(/\.\w+$/, ".mp3");
        s.start(pc.hex("#a855f7")("Extraction de l'audio..."));
        editor.extractAudio(currentInput, audioPath);
        s.stop(pc.green(`✔ Audio extrait : ${path.basename(audioPath)}`));
        const size = fs.statSync(audioPath).size;
        console.log(`    ${pc.dim("Taille :")} ${formatSize(size)}`);
        console.log("");
        return;
      }

      // Copy to final destination if different
      if (currentInput !== outputPath) {
        fs.copyFileSync(currentInput, outputPath);
      }

      const stats = fs.statSync(outputPath);
      const dur = editor.getDuration(outputPath);

      console.log("");
      console.log(`  ${pc.green("✔")} ${pc.bold("Vidéo générée :")}`);
      console.log(`    ${pc.dim("Chemin :")} ${outputPath}`);
      console.log(`    ${pc.dim("Durée :")}  ${formatDuration(dur)}`);
      console.log(`    ${pc.dim("Taille :")} ${formatSize(stats.size)}`);
      console.log("");
      p.outro(pc.green("✔ Terminé."));
    } catch (err) {
      s.stop(pc.red("✖ Erreur"));
      p.log.error(pc.red(err.message || String(err)));
    }
  });

// ═══════════════════════════════════════════════════
// PARSE
// ═══════════════════════════════════════════════════

program.parse(process.argv);
