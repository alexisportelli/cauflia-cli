import { GoogleGenerativeAI } from "@google/generative-ai";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { assembleVideo } from "./video-generator.js";
import fs from "fs";
import path from "path";

export async function runAgent(prompt, config) {
  const s = p.spinner();

  // 1. Initialize Gemini
  s.start("Connexion à l'intelligence artificielle Gemini...");
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  s.stop(pc.green("✔ Connecté à Gemini."));

  // 2. Draft strategy and script
  s.start("Création de votre stratégie marketing et écriture des scènes...");
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

  Tu dois STRICTEMENT retourner uniquement un objet JSON valide (sans fioritures, sans balises markdown de type \`\`\`json, juste le texte brut du JSON) respectant ce schéma exact :
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

  // Clean the output to ensure valid JSON
  let cleanedJson = responseText.trim();
  if (cleanedJson.startsWith("```json")) {
    cleanedJson = cleanedJson.substring(7);
  }
  if (cleanedJson.endsWith("```")) {
    cleanedJson = cleanedJson.substring(0, cleanedJson.length - 3);
  }
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

  // Display strategy beautifully
  p.note(generatedData.strategy, pc.cyan(`Stratégie Marketing : ${generatedData.title}`));

  // Display scenes summary
  p.log.info(pc.yellow("Plan de montage vidéo généré :"));
  generatedData.scenes.forEach((scene, i) => {
    p.log.step(
      `${pc.bold(`Scène ${i + 1} (${scene.mood})`)} : "${pc.italic(scene.text_overlay)}"\n  🔊 Voix-off: "${scene.voiceover_text}"`
    );
  });

  // Ask for confirmation to proceed
  const proceed = await p.confirm({
    message: "Voulez-vous lancer le montage automatique de la vidéo maintenant ?",
  });

  if (!proceed || p.isCancel(proceed)) {
    p.log.warn(pc.yellow("Montage vidéo ignoré par l'utilisateur."));
    return;
  }

  // 3. Assemble Video
  s.start("Lancement de FFmpeg - Génération de la voix-off, des gradients et assemblage...");
  const outputFilename = `cauflia_montage_${Date.now()}.mp4`;
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
  s.stop(pc.green(`✔ Vidéo montée avec succès : ${outputFilename}`));

  // 4. Send to SaaS & Notify
  s.start("Envoi du projet et de la notification sur le SaaS VelocityContent...");
  const saasUrl = config.saas_url || "http://localhost:3000";
  const apiEndpoint = `${saasUrl.replace(/\/$/, "")}/api/cauflia`;

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

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Le serveur a renvoyé un statut ${res.status} : ${errText}`);
    }

    const saasData = await res.json();
    s.stop(pc.green("✔ Synchronisé avec le SaaS !"));
    
    p.note(
      `1. Ouvrez votre SaaS VelocityContent : ${pc.underline(saasUrl)}\n2. Allez sur votre Tableau de Bord ou l'historique.\n3. Vous avez reçu une Notification.\n4. Cliquez sur "Examiner & Publier" pour visionner le projet "${generatedData.title}" et accepter la publication !`,
      "🎉 Étapes suivantes pour publier"
    );
  } catch (err) {
    s.stop(pc.red("⚠ Impossible d'envoyer la notification au SaaS."));
    p.log.warn(`Veuillez vérifier que votre SaaS est démarré sur : ${saasUrl}`);
    p.log.warn(`Détail de l'erreur: ${err.message || err}`);
    p.log.info(`Votre vidéo locale est sauvegardée ici : ${pc.bold(path.resolve(outputFilename))}`);
  }
}
