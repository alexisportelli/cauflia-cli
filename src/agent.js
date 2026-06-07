import { GoogleGenerativeAI } from "@google/generative-ai";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { assembleVideo } from "./video-generator.js";
import { getDir, addMedia } from "./media-library.js";
import fs from "fs";
import path from "path";

function showBanner() {
  console.log("");
  console.log(pc.bold(pc.hex("#6366f1")("  ╔══════════════════════════════════════════╗")));
  console.log(pc.bold(pc.hex("#a855f7")("  ║          ") + pc.bold(pc.hex("#ec4899")("CAUFLIA AGENT")) + pc.bold(pc.hex("#a855f7")("            ║")));
  console.log(pc.bold(pc.hex("#6366f1")("  ╚══════════════════════════════════════════╝")));
  console.log("");
}

function showSection(title) {
  console.log("");
  console.log(pc.bold(pc.hex("#a855f7")(`  ── ${title} ──`)));
  console.log("");
}

export async function runAgent(prompt, config) {
  const s = p.spinner();

  showBanner();

  // 1. Check Gemini key
  if (!config.GEMINI_API_KEY) {
    p.log.error(pc.red("Aucune clé API Gemini configurée."));
    p.log.info(pc.cyan("Configure-la avec : ") + pc.bold("cauflia config"));
    return;
  }

  // 2. Initialize Gemini
  s.start(pc.hex("#a855f7")("Connexion à l'IA Gemini..."));
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  s.stop(pc.green("✔ Connecté à Gemini."));

  // 3. Generate strategy & script
  showSection("Génération de la stratégie");
  s.start(pc.hex("#a855f7")("Création de ta stratégie marketing et écriture des scènes..."));

  const systemInstruction = `
  Tu es Cauflia, un agent d'intelligence artificielle ultra-compétent spécialisé dans la création de vidéos virales de format court (TikTok, Instagram Reels, YouTube Shorts).
  Ton but est de concevoir une stratégie marketing redoutable pour le prompt de l'utilisateur, d'écrire un script de voix-off captivant et de découper la vidéo en 3 à 5 scènes clés.

  RÈGLES IMPORTANTES :
  - Tout ton contenu rédigé et voix-off doit être en FRANÇAIS.
  - La vidéo finale sera un montage vertical (9:16).
  - Écris un script de voix-off (voiceover_text) court et percutant pour chaque scène. Ne dépasse pas 25 mots par scène.
  - Chaque scène doit avoir un court texte affiché à l'écran (text_overlay) de maximum 8 mots.
  - Choisis un style musical de fond cohérent parmi ces trois options : 'lofi', 'synthwave', 'cinematic'.
  - Assigne une ambiance visuelle ('mood') à chaque scène parmi : 'sunset', 'ocean', 'cyberpunk', 'velvet'.

  Tu dois STRICTEMENT retourner uniquement un objet JSON valide (sans fioritures, sans balises markdown, juste le texte brut du JSON) respectant ce schéma exact :
  {
    "strategy": "Une explication détaillée et percutante de la stratégie TikTok, pourquoi ça va marcher, le public cible, et les conseils de hashtags.",
    "title": "Titre accrocheur du projet",
    "music_style": "lofi" | "synthwave" | "cinematic",
    "video_style": "cinematic",
    "scenes": [
      {
        "title": "Nom de la scène",
        "mood": "sunset" | "ocean" | "cyberpunk" | "velvet",
        "text_overlay": "Texte court en français à afficher à l'écran",
        "voiceover_text": "Texte en français lu par le narrateur pour cette scène"
      }
    ]
  }
  `;

  const userPrompt = `Mon projet / produit : ${prompt}. Rédige-moi une stratégie marketing de génie et le script vidéo associé pour TikTok.`;

  let responseText = "";
  try {
    const result = await model.generateContent([systemInstruction, userPrompt]);
    responseText = result.response.text();
  } catch (err) {
    s.stop(pc.red("✖ Échec de la génération avec Gemini."));
    throw new Error("Erreur de l'API Gemini : " + err.message);
  }

  let cleanedJson = responseText.trim();
  if (cleanedJson.startsWith("```json")) cleanedJson = cleanedJson.slice(7);
  if (cleanedJson.endsWith("```")) cleanedJson = cleanedJson.slice(0, -3);
  cleanedJson = cleanedJson.trim();

  let generatedData;
  try {
    generatedData = JSON.parse(cleanedJson);
  } catch (err) {
    s.stop(pc.red("✖ Erreur d'analyse des données de l'IA."));
    console.log(pc.yellow("Données brutes reçues de l'IA :"));
    console.log(responseText);
    throw new Error("L'IA n'a pas renvoyé un format JSON valide.");
  }

  s.stop(pc.green("✔ Stratégie et scènes prêtes !"));

  // Display strategy
  showSection("Stratégie Marketing");
  console.log(pc.bold(pc.hex("#ec4899")(`  ${generatedData.title}`)));
  console.log("");
  console.log(`  ${generatedData.strategy}`);
  console.log("");

  // Display scenes
  showSection("Scènes du script");
  const moodEmojis = { sunset: "🌅", ocean: "🌊", cyberpunk: "🌆", velvet: "🌙" };
  const moodColors = { sunset: "#f59e0b", ocean: "#06b6d4", cyberpunk: "#a855f7", velvet: "#be123c" };

  for (let i = 0; i < generatedData.scenes.length; i++) {
    const scene = generatedData.scenes[i];
    const emoji = moodEmojis[scene.mood] || "🎬";
    const color = moodColors[scene.mood] || "#6366f1";

    console.log(pc.bold(pc.hex(color)(`  ${emoji} Scène ${i + 1} — ${scene.title}`)));
    console.log(`     ${pc.hex(color)("▸ Texte écran :")} "${scene.text_overlay}"`);
    console.log(`     ${pc.hex(color)("▸ Voix-off :")} "${scene.voiceover_text}"`);
    console.log(`     ${pc.hex(color)("▸ Ambiance :")} ${scene.mood}`);
    console.log("");
  }

  console.log(pc.dim(`  🎵 Style musical : ${generatedData.music_style}`));
  console.log("");

  // Ask to proceed with video assembly
  const proceed = await p.confirm({
    message: pc.hex("#6366f1")("Lancer le montage automatique de la vidéo ?"),
  });

  if (!proceed || p.isCancel(proceed)) {
    p.log.warn(pc.yellow("Montage vidéo ignoré."));
    showSection("Projet sauvegardé en local");
    console.log(`  Le script et la stratégie sont disponibles ci-dessus.`);
    console.log(`  Pour générer la vidéo plus tard : ${pc.bold("cauflia generate")}`);
    return;
  }

  // 4. Assemble Video
  showSection("Montage vidéo en cours");
  s.start(pc.hex("#a855f7")("FFmpeg — voix-off, gradients, sous-titres, musique..."));

  const exportsDir = getDir("exports");
  const outputFilename = path.join(exportsDir, `cauflia_${Date.now()}.mp4`);

  let videoResult;
  try {
    videoResult = await assembleVideo(
      generatedData.scenes,
      generatedData.video_style,
      generatedData.music_style,
      outputFilename
    );
  } catch (err) {
    s.stop(pc.red("✖ Échec du montage vidéo."));
    throw new Error("Erreur montage : " + err.message);
  }
  s.stop(pc.green("✔ Vidéo montée avec succès !"));

  // Show result
  const durationStr = videoResult.duration
    ? `${Math.floor(videoResult.duration / 60)}m ${Math.floor(videoResult.duration % 60)}s`
    : "?";
  const fileSize = fs.existsSync(videoResult.filePath)
    ? `${(fs.statSync(videoResult.filePath).size / 1024 / 1024).toFixed(1)} MB`
    : "?";

  console.log("");
  console.log(`  ${pc.green("✔")} ${pc.bold("Vidéo générée :")}`);
  console.log(`    ${pc.dim("Fichier :")} ${videoResult.filePath}`);
  console.log(`    ${pc.dim("Durée :")}   ${durationStr}`);
  console.log(`    ${pc.dim("Taille :")}  ${fileSize}`);
  console.log("");

  // 5. SaaS sync (OPTIONAL)
  if (config.api_key && config.saas_url) {
    const syncSaas = await p.confirm({
      message: pc.hex("#6366f1")("Envoyer le projet sur le SaaS Cauflia ?"),
    });

    if (syncSaas && !p.isCancel(syncSaas)) {
      s.start(pc.hex("#a855f7")("Synchronisation avec le SaaS..."));
      const saasUrl = config.saas_url.replace(/\/$/, "");
      const apiEndpoint = `${saasUrl}/api/cauflia`;

      try {
        const res = await fetch(apiEndpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.api_key}`,
          },
          body: JSON.stringify({
            action: "create_project",
            title: generatedData.title,
            description: generatedData.strategy,
            video_url: outputFilename,
            scenes: generatedData.scenes,
            metadata: {
              music_style: generatedData.music_style,
              video_style: generatedData.video_style,
              local_path: videoResult.filePath,
              duration: videoResult.duration,
            },
          }),
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        s.stop(pc.green("✔ Synchronisé avec le SaaS !"));
      } catch (err) {
        s.stop(pc.yellow("⚠ Impossible d'atteindre le SaaS"));
      }
    } else {
      p.log.info(pc.dim("Projet conservé en local uniquement."));
    }
  }

  // Final message
  console.log("");
  console.log(pc.bold(pc.hex("#6366f1")("  ╔══════════════════════════════════════════╗")));
  console.log(pc.bold(pc.hex("#a855f7")("  ║    ") + pc.bold(pc.hex("#ec4899")("✅ PROJET TERMINÉ !")) + pc.bold(pc.hex("#a855f7")("        ║")));
  console.log(pc.bold(pc.hex("#6366f1")("  ╚══════════════════════════════════════════╝")));
  console.log("");
  console.log(`  ${pc.dim("Commande rapide :")} ${pc.bold(`cauflia "${prompt}"`)}`);
  console.log("");
}
