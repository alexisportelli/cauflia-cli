import { GoogleGenerativeAI } from "@google/generative-ai";
import * as p from "@clack/prompts";
import pc from "picocolors";
import readline from "readline";
import path from "path";
import fs from "fs";
import os from "os";
import { execSync } from "child_process";

// Import utilities
import { downloadYouTube, getInfo } from "./youtube.js";
import * as editor from "./video-editor.js";
import * as library from "./media-library.js";
import { assembleVideo } from "./video-generator.js";

// Helper to find a JSON tool call anywhere in the response text
function findToolCall(text) {
  // 1. Try to find JSON inside markdown code blocks
  const markdownRegex = /```(?:json)?\s*(\{\s*"tool"[\s\S]*?\})\s*```/gi;
  const match = markdownRegex.exec(text);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch (_) {}
  }

  // 2. Try to find raw JSON block in the entire text
  const rawRegex = /(\{\s*"tool"[\s\S]*?\})/gi;
  let rawMatch;
  while ((rawMatch = rawRegex.exec(text)) !== null) {
    try {
      return JSON.parse(rawMatch[1]);
    } catch (_) {}
  }

  // 3. Try to find JSON block by bracket matching if above failed (very robust fallback)
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "{") {
      for (let j = text.length - 1; j > i; j--) {
        if (text[j] === "}") {
          try {
            const candidate = text.substring(i, j + 1);
            if (candidate.includes('"tool"')) {
              const parsed = JSON.parse(candidate);
              if (parsed && parsed.tool) {
                return parsed;
              }
            }
          } catch (_) {}
        }
      }
    }
  }

  return null;
}

// Helpers for the system-level tools
function runShellCommand(command) {
  try {
    const stdout = execSync(command, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
    return { success: true, stdout };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      stdout: err.stdout ? err.stdout.toString() : "",
      stderr: err.stderr ? err.stderr.toString() : ""
    };
  }
}

function readFileContent(filePath) {
  try {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Le fichier n'existe pas : ${resolvedPath}` };
    }
    const stat = fs.statSync(resolvedPath);
    if (stat.isDirectory()) {
      return { success: false, error: `${resolvedPath} est un dossier, pas un fichier.` };
    }
    const content = fs.readFileSync(resolvedPath, "utf-8");
    if (content.length > 50000) {
      return {
        success: true,
        truncated: true,
        content: content.substring(0, 50000) + "\n\n...[CONTENU TRONQUÉ CAR TROP GRAND]..."
      };
    }
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function writeFileContent(filePath, content) {
  try {
    const resolvedPath = path.resolve(filePath);
    const parentDir = path.dirname(resolvedPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, content, "utf-8");
    return { success: true, message: `Fichier écrit avec succès à : ${resolvedPath}` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function listDirectoryContent(dirPath = ".") {
  try {
    const resolvedPath = path.resolve(dirPath);
    if (!fs.existsSync(resolvedPath)) {
      return { success: false, error: `Le dossier n'existe pas : ${resolvedPath}` };
    }
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory()) {
      return { success: false, error: `${resolvedPath} n'est pas un dossier.` };
    }
    const files = fs.readdirSync(resolvedPath).map(file => {
      const full = path.join(resolvedPath, file);
      const fStat = fs.statSync(full);
      return {
        name: file,
        isDirectory: fStat.isDirectory(),
        size: fStat.isDirectory() ? 0 : fStat.size,
        modified: fStat.mtime
      };
    });
    return { success: true, files: files.slice(0, 100) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function startSession(config, initialPrompt = "") {
  if (!config.GEMINI_API_KEY) {
    p.log.error(pc.red("Veuillez configurer votre clé GEMINI_API_KEY."));
    return;
  }

  const osPlatform = process.platform;
  const workingDir = process.cwd();

  const SYSTEM_PROMPT = `
Tu es Cauflia, un agent d'intelligence artificielle conversationnel et autonome, de type "OpenClaw" ou "Open Interpreter", spécialisé dans l'assistance système, le développement, et la création/montage vidéo.
Tu t'exprimes dans un ton chaleureux, créatif et professionnel, entièrement en FRANÇAIS.

Tu as un accès complet à l'ordinateur de l'utilisateur via des outils puissants que tu appelles de manière autonome.
Ton but est d'accomplir les requêtes de l'utilisateur, qu'il s'agisse de gérer des fichiers, de développer des scripts, d'exécuter des tests, de télécharger ou d'éditer des vidéos, etc.

INFORMATIONS SYSTÈME :
- Système d'exploitation : ${osPlatform}
- Dossier de travail actuel : ${workingDir}

CONSIGNES DE SÉCURITÉ ET D'UTILISATION DES OUTILS :
- Explique toujours brièvement ce que tu t'apprêtes à faire avant d'appeler un outil.
- Pour appeler un outil, insère obligatoirement un unique bloc JSON valide de la forme suivante n'importe où dans ta réponse (de préférence à la fin) :
\`\`\`json
{
  "tool": "nom_de_l_outil",
  "arguments": { ... }
}
\`\`\`
- Si tu appelles un outil, attends la réponse du système (qui te renverra le résultat de l'outil) avant de poursuivre.
- N'invente pas d'autres outils que ceux de la liste ci-dessous.

LISTE DES OUTILS DISPONIBLES :

1. "execute_command"
   - Description : Exécute une commande shell de manière autonome dans le répertoire de travail actuel. Permet d'installer des packages, d'exécuter des tests, de lancer des serveurs, d'inspecter l'environnement, etc.
   - Arguments :
     - "command": (string) La commande système exacte à exécuter.

2. "read_file"
   - Description : Lit le contenu textuel complet d'un fichier sur le disque.
   - Arguments :
     - "path": (string) Le chemin absolu ou relatif du fichier à lire.

3. "write_file"
   - Description : Crée un nouveau fichier ou écrase un fichier existant avec le contenu fourni.
   - Arguments :
     - "path": (string) Le chemin complet du fichier à écrire.
     - "content": (string) Le contenu textuel à enregistrer.

4. "list_directory"
   - Description : Liste les fichiers et dossiers présents dans un répertoire donné.
   - Arguments :
     - "path": (string, optionnel) Le chemin du répertoire à lister. Par défaut "." (répertoire actuel).

5. "generate_video"
   - Description : Génère une stratégie marketing complète et assemble automatiquement une vidéo courte (Short/TikTok) à partir d'un prompt.
   - Arguments :
     - "prompt": (string) Le sujet ou produit pour la vidéo.

6. "download_youtube"
   - Description : Télécharge une vidéo ou extrait l'audio depuis une URL YouTube.
   - Arguments :
     - "url": (string) L'URL de la vidéo YouTube.
     - "audio": (boolean, optionnel) Si true, télécharge uniquement le fichier audio en MP3.
     - "quality": (string, optionnel) Qualité vidéo : 'best', '1080', '720', '480'. Par défaut 'best'.
     - "clip": (string, optionnel) Range pour extraire un clip, ex: '10-30'.

7. "edit_video"
   - Description : Effectue des opérations d'édition/montage complexes sur des fichiers vidéo locaux.
   - Arguments :
     - "inputs": (array of strings) Chemins des fichiers vidéo d'entrée.
     - "output": (string, optionnel) Chemin du fichier de sortie souhaité.
     - "trim": (string, optionnel) Extrait 'début-fin' (ex: '5-15').
     - "concat": (boolean, optionnel) Concaténer plusieurs fichiers d'entrée.
     - "speed": (number, optionnel) Facteur de vitesse (ex: 1.5, 2.0).
     - "resize": (string, optionnel) Dimensions, ex: '1080x1920'.
     - "crop": (string, optionnel) Dimensions de rognage (ex: 'w:h:x:y').
     - "text": (string, optionnel) Texte à superposer à l'écran.
     - "overlay": (string, optionnel) Image à superposer.
     - "audio": (string, optionnel) Piste audio à mixer en fond.
     - "replaceAudio": (string, optionnel) Audio pour remplacer totalement la bande-son.
     - "extractAudio": (boolean, optionnel) Si true, extrait l'audio au format MP3.
     - "gradient": (string, optionnel) sunset, ocean, cyberpunk, velvet.
     - "vignette": (boolean, optionnel) Activer l'effet vignette.
     - "grain": (boolean, optionnel) Activer l'effet grain cinéma.

8. "manage_library"
   - Description : Gère la médiathèque locale (listage, import, statistiques, ou ouverture du dossier).
   - Arguments :
     - "action": (string) 'list', 'import', 'stats', 'open'.
     - "type": (string, optionnel) 'videos', 'images', 'audio'. Obligatoire pour 'list' et 'import'.
     - "path": (string, optionnel) Chemin du fichier à importer pour l'action 'import'.
`;

  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    systemInstruction: SYSTEM_PROMPT,
  });

  const chat = model.startChat({
    history: [],
  });

  console.log(pc.bold(pc.hex("#ec4899")("╭──────────────────────────────────────╮")));
  console.log(pc.bold(pc.hex("#ec4899")("│        🤖  CAUFLIA CHAT  🤖         │")));
  console.log(pc.bold(pc.hex("#ec4899")("╰──────────────────────────────────────╯")));
  console.log(pc.dim(`  OS : ${osPlatform} · ${workingDir}`));
  console.log(pc.dim("  Tape 'exit' pour quitter · Bonne session !\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const promptUser = () => {
    rl.question(`\n${pc.bold(pc.hex("#a855f7")("👤 Vous ❯ "))}`, async (input) => {
      const trimmed = input.trim();
      if (trimmed.toLowerCase() === "exit" || trimmed.toLowerCase() === "quit") {
        p.outro(pc.yellow("Session fermée. À bientôt !"));
        rl.close();
        process.exit(0);
      }

      if (!trimmed) {
        promptUser();
        return;
      }

      await handleMessage(trimmed);
    });
  };

  const handleMessage = async (messageText) => {
    const s = p.spinner();
    s.start(pc.hex("#a855f7")("Cauflia réfléchit..."));

    try {
      // 1. Initial response streaming
      let isFirstChunk = true;
      let responseText = "";

      const resultStream = await chat.sendMessageStream(messageText);
      for await (const chunk of resultStream.stream) {
        if (isFirstChunk) {
          s.stop(pc.green("✔ Réponse reçue"));
          console.log(`\n${pc.bold(pc.hex("#ec4899")("🤖 Cauflia ❯ "))}`);
          isFirstChunk = false;
        }
        const chunkText = chunk.text();
        responseText += chunkText;
        process.stdout.write(chunkText);
      }
      console.log("");

      // 2. Tool execution and chaining loop
      let currentResponse = responseText;
      let toolCall = findToolCall(currentResponse);

      while (toolCall) {
        const toolResult = await executeTool(toolCall.tool, toolCall.arguments, config);
        const resultString = JSON.stringify(toolResult);

        // Resume stream with tool execution output
        s.start(pc.hex("#a855f7")("Analyse du résultat par l'agent..."));
        
        let isFirstFollowUpChunk = true;
        let followUpText = "";

        const followUpStream = await chat.sendMessageStream(`[RESULTAT DE L'OUTIL] ${resultString}`);
        for await (const chunk of followUpStream.stream) {
          if (isFirstFollowUpChunk) {
            s.stop(pc.green("✔ Analyse reçue"));
            console.log(`\n${pc.bold(pc.hex("#ec4899")("🤖 Cauflia ❯ "))}`);
            isFirstFollowUpChunk = false;
          }
          const chunkText = chunk.text();
          followUpText += chunkText;
          process.stdout.write(chunkText);
        }
        console.log("");

        currentResponse = followUpText;
        toolCall = findToolCall(currentResponse);
      }

    } catch (err) {
      s.stop(pc.red("✖ Erreur"));
      console.error(pc.red(err.message || String(err)));
    }

    promptUser();
  };

  // If there was an initial prompt provided, send it immediately
  if (initialPrompt) {
    console.log(pc.bold(pc.hex("#6366f1")(`👤 Lancement rapide : ${initialPrompt}\n`)));
    await handleMessage(initialPrompt);
  } else {
    promptUser();
  }
}

// Tool Dispatcher
async function executeTool(name, args, config) {
  const s = p.spinner();
  s.start(pc.hex("#6366f1")(`Exécution de l'outil [${name}]...`));

  try {
    switch (name) {
      case "execute_command": {
        const result = runShellCommand(args.command);
        if (result.success) {
          s.stop(pc.green("✔ Commande exécutée avec succès !"));
        } else {
          s.stop(pc.red("✖ Échec de la commande !"));
        }
        return result;
      }

      case "read_file": {
        const result = readFileContent(args.path);
        if (result.success) {
          s.stop(pc.green("✔ Fichier lu avec succès !"));
        } else {
          s.stop(pc.red("✖ Échec de la lecture !"));
        }
        return result;
      }

      case "write_file": {
        const result = writeFileContent(args.path, args.content);
        if (result.success) {
          s.stop(pc.green("✔ Fichier écrit avec succès !"));
        } else {
          s.stop(pc.red("✖ Échec de l'écriture !"));
        }
        return result;
      }

      case "list_directory": {
        const result = listDirectoryContent(args.path);
        if (result.success) {
          s.stop(pc.green("✔ Répertoire listé avec succès !"));
        } else {
          s.stop(pc.red("✖ Échec du listage !"));
        }
        return result;
      }

      case "generate_video": {
        const exportsDir = library.getDir("exports");
        const outputFilename = path.join(exportsDir, `cauflia_${Date.now()}.mp4`);
        
        // Use Gemini to generate scenes structure
        const promptModel = new GoogleGenerativeAI(config.GEMINI_API_KEY).getGenerativeModel({
          model: "gemini-1.5-flash",
        });

        const systemInstruction = `
        Tu es un sous-système de Cauflia chargé de générer un JSON valide de scènes de montage.
        Tout ton contenu rédigé et voix-off doit être en FRANÇAIS.
        La vidéo finale sera un montage vertical (9:16).
        Écris un script de voix-off (voiceover_text) court et percutant pour chaque scène (max 25 mots).
        Chaque scène doit avoir un court texte affiché à l'écran (text_overlay) de maximum 8 mots.
        Choisis un style musical de fond cohérent parmi ces trois options : 'lofi', 'synthwave', 'cinematic'.
        Assigne une ambiance visuelle ('mood') à chaque scène parmi : 'sunset', 'ocean', 'cyberpunk', 'velvet'.

        Tu dois STRICTEMENT retourner uniquement un objet JSON valide (sans fioritures, sans balises markdown) de la forme :
        {
          "title": "Titre du projet",
          "music_style": "lofi" | "synthwave" | "cinematic",
          "scenes": [
            {
              "title": "Nom de la scène",
              "mood": "sunset" | "ocean" | "cyberpunk" | "velvet",
              "text_overlay": "Texte court",
              "voiceover_text": "Script lu"
            }
          ]
        }`;

        const promptRes = await promptModel.generateContent([systemInstruction, `Sujet : ${args.prompt}`]);
        let cleanedJson = promptRes.response.text().trim();
        if (cleanedJson.startsWith("```json")) cleanedJson = cleanedJson.slice(7);
        if (cleanedJson.endsWith("```")) cleanedJson = cleanedJson.slice(0, -3);
        cleanedJson = cleanedJson.trim();

        const data = JSON.parse(cleanedJson);
        const result = await assembleVideo(data.scenes, "cinematic", data.music_style, outputFilename);
        s.stop(pc.green("✔ Vidéo générée avec succès !"));
        return { success: true, filePath: result.filePath, duration: result.duration };
      }

      case "download_youtube": {
        const info = await getInfo(args.url);
        const type = args.audio ? "audio" : "video";
        const result = await downloadYouTube(args.url, {
          type,
          quality: args.quality || "best",
          outputName: `yt_${Date.now()}`,
        });
        s.stop(pc.green("✔ Téléchargement terminé !"));
        return { success: true, title: info.title, filePath: result.path };
      }

      case "edit_video": {
        const exportsDir = library.getDir("exports");
        let currentInput = path.resolve(args.inputs[0]);
        const outputPath = args.output
          ? path.resolve(args.output)
          : path.join(exportsDir, `edit_${Date.now()}.mp4`);

        if (args.trim) {
          const parts = args.trim.split("-");
          const start = parseFloat(parts[0]);
          const end = parts[1] ? parseFloat(parts[1]) : start + 10;
          const tempOutput = path.join(exportsDir, `trim_${Date.now()}.mp4`);
          editor.trimClip(currentInput, tempOutput, start, end - start);
          currentInput = tempOutput;
        }

        if (args.concat && args.inputs.length > 1) {
          const tempOutput = path.join(exportsDir, `concat_${Date.now()}.mp4`);
          editor.concatClips(args.inputs.map(i => path.resolve(i)), tempOutput);
          currentInput = tempOutput;
        }

        if (args.speed) {
          const tempOutput = path.join(exportsDir, `speed_${Date.now()}.mp4`);
          editor.changeSpeed(currentInput, tempOutput, args.speed);
          currentInput = tempOutput;
        }

        if (args.resize) {
          const parts = args.resize.split("x");
          const tempOutput = path.join(exportsDir, `resize_${Date.now()}.mp4`);
          editor.resizeClip(currentInput, tempOutput, parseInt(parts[0]), parseInt(parts[1]));
          currentInput = tempOutput;
        }

        if (args.crop) {
          const tempOutput = path.join(exportsDir, `crop_${Date.now()}.mp4`);
          editor.cropClip(currentInput, tempOutput, args.crop);
          currentInput = tempOutput;
        }

        if (args.text) {
          const tempOutput = path.join(exportsDir, `text_${Date.now()}.mp4`);
          editor.addTextOverlay(currentInput, tempOutput, args.text);
          currentInput = tempOutput;
        }

        if (args.overlay) {
          const tempOutput = path.join(exportsDir, `overlay_${Date.now()}.mp4`);
          editor.overlayImage(currentInput, path.resolve(args.overlay), tempOutput);
          currentInput = tempOutput;
        }

        if (args.gradient) {
          const tempOutput = path.join(exportsDir, `gradient_${Date.now()}.mp4`);
          editor.addGradientOverlay(currentInput, tempOutput, args.gradient);
          currentInput = tempOutput;
        }

        if (args.vignette) {
          const tempOutput = path.join(exportsDir, `vignette_${Date.now()}.mp4`);
          editor.addVignette(currentInput, tempOutput);
          currentInput = tempOutput;
        }

        if (args.grain) {
          const tempOutput = path.join(exportsDir, `grain_${Date.now()}.mp4`);
          editor.addFilmGrain(currentInput, tempOutput);
          currentInput = tempOutput;
        }

        if (args.audio) {
          const tempOutput = path.join(exportsDir, `audio_${Date.now()}.mp4`);
          editor.mixAudio(currentInput, path.resolve(args.audio), tempOutput);
          currentInput = tempOutput;
        }

        if (args.replaceAudio) {
          const tempOutput = path.join(exportsDir, `reaudio_${Date.now()}.mp4`);
          editor.replaceAudio(currentInput, path.resolve(args.replaceAudio), tempOutput);
          currentInput = tempOutput;
        }

        if (args.extractAudio) {
          const audioPath = outputPath.replace(/\.\w+$/, ".mp3");
          editor.extractAudio(currentInput, audioPath);
          s.stop(pc.green("✔ Audio extrait avec succès !"));
          return { success: true, filePath: audioPath };
        }

        if (currentInput !== outputPath) {
          fs.copyFileSync(currentInput, outputPath);
        }

        s.stop(pc.green("✔ Montage terminé !"));
        return { success: true, filePath: outputPath };
      }

      case "manage_library": {
        if (args.action === "stats") {
          const stats = library.getLibraryStats();
          s.stop(pc.green("✔ Statistiques lues."));
          return { success: true, stats };
        }

        if (args.action === "list") {
          const files = library.listOnDisk(args.type);
          s.stop(pc.green("✔ Fichiers récupérés."));
          return { success: true, files };
        }

        if (args.action === "import") {
          const dest = library.addMedia(path.resolve(args.path), args.type);
          s.stop(pc.green("✔ Importation réussie."));
          return { success: true, destination: dest };
        }

        if (args.action === "open") {
          const stats = library.getLibraryStats();
          const { execSync } = await import("child_process");
          execSync(`explorer "${stats.studioDir}"`, { stdio: "ignore" });
          s.stop(pc.green("✔ Dossier ouvert."));
          return { success: true, message: "Dossier ouvert avec succès." };
        }
        break;
      }
    }
  } catch (err) {
    s.stop(pc.red(`✖ Erreur de l'outil [${name}]`));
    return { success: false, error: err.message || String(err) };
  }

  s.stop(pc.red("✖ Outil inconnu"));
  return { success: false, error: `Outil inconnu : ${name}` };
}
