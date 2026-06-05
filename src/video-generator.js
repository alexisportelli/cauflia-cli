import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import https from "https";

const CACHE_DIR = path.join(os.tmpdir(), "cauflia_cache");

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

// Download helper
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { "User-Agent": "cauflia-cli" } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        // Handle redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(dest);
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Split text into chunks < 200 chars for Google Translate TTS
function splitTextForTTS(text) {
  const sentences = text.split(/([.!?\n]+)/);
  const chunks = [];
  let currentChunk = "";

  for (const part of sentences) {
    if ((currentChunk + part).length > 180) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = part;
    } else {
      currentChunk += part;
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

// Generate Voiceover using free Google Translate TTS
async function generateVoiceover(text, filename) {
  const chunks = splitTextForTTS(text);
  const tempFiles = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const chunkFile = path.join(CACHE_DIR, `voice_chunk_${Date.now()}_${i}.mp3`);
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=fr&client=tw-ob&q=${encodeURIComponent(chunk)}`;
    try {
      await downloadFile(url, chunkFile);
      tempFiles.push(chunkFile);
    } catch (err) {
      console.error(`Erreur téléchargement voix pour le fragment: "${chunk}"`, err);
    }
  }

  if (tempFiles.length === 0) {
    throw new Error("Impossible de générer le fichier voix");
  }

  // Combine voice chunks using ffmpeg
  const destPath = path.join(CACHE_DIR, filename);
  if (tempFiles.length === 1) {
    fs.copyFileSync(tempFiles[0], destPath);
  } else {
    const fileListPath = path.join(CACHE_DIR, `list_${Date.now()}.txt`);
    const fileListContent = tempFiles.map(f => `file '${f.replace(/\\/g, "/")}'`).join("\n");
    fs.writeFileSync(fileListPath, fileListContent, "utf-8");

    try {
      execSync(`ffmpeg -y -f concat -safe 0 -i "${fileListPath}" -c copy "${destPath}"`, { stdio: "ignore" });
    } catch (err) {
      throw new Error("Erreur d'assemblage ffmpeg pour la voix: " + err.message);
    } finally {
      fs.unlinkSync(fileListPath);
    }
  }

  // Cleanup chunks
  for (const f of tempFiles) {
    fs.unlinkSync(f);
  }

  return destPath;
}

// Get voice duration using ffmpeg
function getAudioDuration(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      { encoding: "utf-8" }
    );
    return parseFloat(output.trim()) || 5.0;
  } catch {
    return 5.0;
  }
}

// Map mood to procedural gradient colors in ffmpeg
function getGradientFilter(mood) {
  switch (mood?.toLowerCase()) {
    case "energetic":
    case "cyberpunk":
      // Neon Purple to Hot Pink
      return "geq=r='150+105*sin(X/100+T)':g='20+20*sin(Y/100-T)':b='180+75*cos(X/200+T)'";
    case "calm":
    case "ocean":
      // Deep Blue to Turquoise
      return "geq=r='10+10*sin(X/100+T)':g='100+80*sin(Y/150)':b='180+75*cos(X/150+T)'";
    case "mysterious":
    case "dark":
    case "velvet":
      // Dark Violet to Dark Crimson
      return "geq=r='60+40*sin(X/120+T/2)':g='10+10*sin(Y/200)':b='80+30*sin(X/100-T)'";
    case "happy":
    case "sunset":
    default:
      // Sunset orange-pink to golden
      return "geq=r='220+35*sin(X/200+T)':g='100+70*sin(Y/150-T)':b='50+50*cos(X/100+T)'";
  }
}

// Escape text for ffmpeg drawtext filter
function escapeFFmpegText(text) {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\r?\n/g, " ");
}

export async function assembleVideo(scenes, styleName, bgMusicStyle, outputFilename) {
  const compiledScenes = [];
  
  // 1. Download Background Music based on style
  const musicUrls = {
    lofi: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3", // Free loop fallback
    synthwave: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    cinematic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  };
  
  const musicUrl = musicUrls[bgMusicStyle?.toLowerCase()] || musicUrls.lofi;
  const localMusicPath = path.join(CACHE_DIR, `music_${bgMusicStyle || "lofi"}.mp3`);
  
  if (!fs.existsSync(localMusicPath)) {
    try {
      await downloadFile(musicUrl, localMusicPath);
    } catch {
      // Create empty fallback music if download fails
      try {
        execSync(`ffmpeg -y -f lavfi -i anullsrc=r=44100:cl=stereo -t 60 -q:a 9 -acodec libmp3lame "${localMusicPath}"`, { stdio: "ignore" });
      } catch {}
    }
  }

  // 2. Generate Voiceover and Video clips for each scene
  let totalDuration = 0;
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const voiceText = scene.voiceover_text || scene.content || "";
    const overlayText = scene.text_overlay || scene.title || "";
    const mood = scene.mood || "sunset";

    const voiceFile = `voice_scene_${i}_${Date.now()}.mp3`;
    let voicePath = "";
    let duration = 4.0; // Default fallback

    if (voiceText.trim()) {
      try {
        voicePath = await generateVoiceover(voiceText, voiceFile);
        duration = getAudioDuration(voicePath);
      } catch (err) {
        console.error(`[TTS Error] Utilise la durée par défaut pour la scène ${i}:`, err.message);
      }
    }

    // Prepare procedural gradient segment with moving gradient
    const tempClipPath = path.join(CACHE_DIR, `clip_${i}_${Date.now()}.mp4`);
    const gradFilter = getGradientFilter(mood);
    const escapedText = escapeFFmpegText(overlayText);
    
    // Add subtitle/drawtext if present
    let videoFilter = `${gradFilter}`;
    if (escapedText) {
      videoFilter += `,drawtext=text='${escapedText}':fontcolor=white:fontsize=46:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.5:boxborderw=24:line_spacing=10`;
    }

    // Build video segment using ffmpeg
    try {
      if (voicePath) {
        // Render video segment synchronized with the generated voiceover segment
        execSync(
          `ffmpeg -y -f lavfi -i "${videoFilter}" -i "${voicePath}" -t ${duration} -s 1080x1920 -r 30 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k "${tempClipPath}"`,
          { stdio: "ignore" }
        );
      } else {
        // Fallback segment with silent audio
        execSync(
          `ffmpeg -y -f lavfi -i "${videoFilter}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -t ${duration} -s 1080x1920 -r 30 -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k "${tempClipPath}"`,
          { stdio: "ignore" }
        );
      }
      compiledScenes.push({ clipPath: tempClipPath, duration });
      totalDuration += duration;
    } catch (err) {
      console.error(`Erreur de génération vidéo de la scène ${i}:`, err.message);
    }
  }

  if (compiledScenes.length === 0) {
    throw new Error("Aucun segment vidéo n'a pu être compilé.");
  }

  // 3. Concatenate all compiled scenes together
  const concatListPath = path.join(CACHE_DIR, `concat_list_${Date.now()}.txt`);
  const concatContent = compiledScenes.map(cs => `file '${cs.clipPath.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(concatListPath, concatContent, "utf-8");

  const unmixedVideoPath = path.join(CACHE_DIR, `unmixed_${Date.now()}.mp4`);
  try {
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${unmixedVideoPath}"`, { stdio: "ignore" });
  } catch (err) {
    throw new Error("Erreur de concaténation ffmpeg: " + err.message);
  } finally {
    fs.unlinkSync(concatListPath);
  }

  // 4. Mix background music into the final video
  // Set music volume low (12%) and loop it or limit to totalDuration
  const finalDest = path.resolve(outputFilename);
  try {
    execSync(
      `ffmpeg -y -i "${unmixedVideoPath}" -stream_loop -1 -i "${localMusicPath}" -filter_complex "[1:a]volume=0.12[bg];[0:a][bg]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k "${finalDest}"`,
      { stdio: "ignore" }
    );
  } catch (err) {
    // If amix fails, just copy the unmixed video
    fs.copyFileSync(unmixedVideoPath, finalDest);
  } finally {
    fs.unlinkSync(unmixedVideoPath);
    // Cleanup temporary clip segments
    for (const cs of compiledScenes) {
      try {
        fs.unlinkSync(cs.clipPath);
      } catch {}
    }
  }

  return {
    filePath: finalDest,
    duration: totalDuration,
  };
}
