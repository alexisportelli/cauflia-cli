import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

const CACHE_DIR = path.join(os.tmpdir(), "cauflia_editor");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function escapePath(p) {
  return `"${p.replace(/\\/g, "/")}"`;
}

// ===========================================================================
// CLIP OPERATIONS
// ===========================================================================

export function trimClip(inputPath, outputPath, start, duration) {
  execSync(
    `ffmpeg -y -ss ${start} -i ${escapePath(inputPath)} -t ${duration} -c copy ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function cutClip(inputPath, outputPath, cuts) {
  // cuts: [{start, end}, ...]
  const parts = [];
  for (let i = 0; i < cuts.length; i++) {
    const { start, end } = cuts[i];
    const partPath = path.join(CACHE_DIR, `part_${i}_${Date.now()}.mp4`);
    const duration = end - start;
    execSync(
      `ffmpeg -y -ss ${start} -i ${escapePath(inputPath)} -t ${duration} -c copy ${escapePath(partPath)}`,
      { stdio: "ignore", timeout: 120000 }
    );
    parts.push(partPath);
  }

  if (parts.length === 1) {
    fs.copyFileSync(parts[0], outputPath);
    fs.unlinkSync(parts[0]);
    return outputPath;
  }

  concatClips(parts, outputPath);
  for (const p of parts) try { fs.unlinkSync(p); } catch {}
  return outputPath;
}

export function changeSpeed(inputPath, outputPath, speed) {
  const tempo = 1 / speed;
  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -filter_complex "[0:v]setpts=${tempo}*PTS[v];[0:a]atempo=${speed}[a]" -map "[v]" -map "[a]" ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function resizeClip(inputPath, outputPath, width, height) {
  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -vf "scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2" ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function cropClip(inputPath, outputPath, cropFilter) {
  // cropFilter: "iw/2:ih/2:iw/4:ih/4" (w:h:x:y)
  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -vf "crop=${cropFilter}" ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function rotateClip(inputPath, outputPath, angle) {
  const transpose = angle === 90 ? 1 : angle === -90 || angle === 270 ? 2 : angle === 180 ? "vflip,hflip" : "";
  if (transpose) {
    execSync(
      `ffmpeg -y -i ${escapePath(inputPath)} -vf "transpose=${transpose}" ${escapePath(outputPath)}`,
      { stdio: "ignore", timeout: 120000 }
    );
  } else {
    execSync(
      `ffmpeg -y -i ${escapePath(inputPath)} -vf "rotate=${angle}*PI/180:fillcolor=black" ${escapePath(outputPath)}`,
      { stdio: "ignore", timeout: 120000 }
    );
  }
  return outputPath;
}

// ===========================================================================
// CONCATENATION & TRANSITIONS
// ===========================================================================

export function concatClips(inputPaths, outputPath) {
  const listPath = path.join(CACHE_DIR, `concat_${Date.now()}.txt`);
  const content = inputPaths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n");
  fs.writeFileSync(listPath, content, "utf-8");

  try {
    execSync(
      `ffmpeg -y -f concat -safe 0 -i ${escapePath(listPath)} -c copy ${escapePath(outputPath)}`,
      { stdio: "ignore", timeout: 300000 }
    );
  } finally {
    try { fs.unlinkSync(listPath); } catch {}
  }
  return outputPath;
}

export function concatWithTransition(inputPaths, outputPath, transition = "fade", duration = 0.5) {
  if (inputPaths.length === 1) {
    fs.copyFileSync(inputPaths[0], outputPath);
    return outputPath;
  }

  const listPath = path.join(CACHE_DIR, `xtrans_${Date.now()}.txt`);
  const filterParts = [];
  const streamMaps = [];

  inputPaths.forEach((p, i) => {
    const escaped = p.replace(/\\/g, "/");
    filterParts.push(`[${i}:v][${i}:a]`);
    streamMaps.push(`-i ${escapePath(p)}`);
  });

  let filterComplex;
  if (transition === "fade") {
    // Simple crossfade using concat with overlapped transitions
    const inputs = inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
    filterComplex =
      `${inputs} concat=n=${inputPaths.length}:v=1:a=1 [v][a]`;
  } else if (transition === "dissolve") {
    // Gltransitions-style dissolve (simplified)
    const inputs = inputPaths.map((_, i) => `[${i}:v]`).join("");
    filterComplex =
      `${inputs} concat=n=${inputPaths.length}:v=1:a=1 [v][a]`;
  } else {
    // Crossfade using ffmpeg xfade filter
    const vFilters = [];
    const aFilters = [];

    for (let i = 0; i < inputPaths.length - 1; i++) {
      const offset = i * 2;
      if (i === 0) {
        vFilters.push(`[${offset}]format=gbrp10le[vo${i}]`);
        vFilters.push(`[${offset + 1}]format=gbrp10le[vi${i}]`);
      } else {
        vFilters.push(`[${offset}]format=gbrp10le[vi${i}]`);
      }
    }

    // Simple xfade between consecutive pairs
    let expr = "";
    for (let i = 0; i < inputPaths.length - 1; i++) {
      if (i === 0) {
        expr = `xfade=transition=fade:duration=${duration}:offset=0`;
      }
    }

    const inputs = inputPaths.map((_, i) => `[${i}:v][${i}:a]`).join("");
    filterComplex = `${inputs} concat=n=${inputPaths.length}:v=1:a=1[v0][a0]`;
  }

  const filterArg = filterComplex ? `-filter_complex "${filterComplex}"` : "";
  const mapArg = `-map "[v]" -map "[a]"`;
  const cmd = `ffmpeg -y ${streamMaps.join(" ")} ${filterArg} ${mapArg} ${escapePath(outputPath)}`;

  execSync(cmd, { stdio: "ignore", timeout: 300000 });
  return outputPath;
}

// ===========================================================================
// OVERLAYS
// ===========================================================================

export function overlayImage(videoPath, imagePath, outputPath, opts = {}) {
  const {
    x = "(W-w)/2",
    y = "(H-h)/2",
    scale = null,
    start = 0,
    end = null,
  } = opts;

  let filter = `overlay=${x}:${y}`;
  if (scale) {
    filter = `[1]scale=${scale}[ov];[0][ov]${filter}`;
  }
  if (end) {
    filter = `overlay=${x}:${y}:enable='between(t,${start},${end})'`;
  }

  const scaleFilter = scale ? `-i ${escapePath(imagePath)}` : `-i ${escapePath(imagePath)}`;
  execSync(
    `ffmpeg -y -i ${escapePath(videoPath)} ${scaleFilter} -filter_complex "${filter}" -c:a copy ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function addTextOverlay(inputPath, outputPath, text, opts = {}) {
  const {
    font = "Arial",
    size = 48,
    color = "white",
    x = "(w-text_w)/2",
    y = "(h-text_h)/2",
    box = 1,
    boxColor = "black@0.5",
    boxBorderW = 16,
  } = opts;

  const escaped = text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "'\\\\''")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");

  const drawText = `drawtext=text='${escaped}':font=${font}:fontsize=${size}:fontcolor=${color}:x=${x}:y=${y}:box=${box}:boxcolor=${boxColor}:boxborderw=${boxBorderW}:line_spacing=10`;

  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -vf "${drawText}" -c:a copy ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

// ===========================================================================
// AUDIO OPERATIONS
// ===========================================================================

export function mixAudio(videoPath, audioPath, outputPath, opts = {}) {
  const {
    videoVolume = 1.0,
    bgVolume = 0.15,
    fadeIn = 0,
    fadeOut = 0,
    loop = false,
  } = opts;

  const loopFilter = loop ? "-stream_loop -1" : "";
  const fadeFilters = [];

  if (fadeIn > 0) fadeFilters.push(`afade=t=in:d=${fadeIn}`);
  if (fadeOut > 0) fadeFilters.push(`afade=t=out:st=${fadeOut}:d=${fadeOut}`);
  const bgFilter = fadeFilters.length > 0 ? fadeFilters.join(",") : "anull";

  execSync(
    `ffmpeg -y -i ${escapePath(videoPath)} ${loopFilter} -i ${escapePath(audioPath)} ` +
    `-filter_complex "[0:a]volume=${videoVolume}[va];[1:a]volume=${bgVolume},${bgFilter}[bg];[va][bg]amix=inputs=2:duration=first[a]" ` +
    `-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 128k ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function replaceAudio(videoPath, audioPath, outputPath) {
  execSync(
    `ffmpeg -y -i ${escapePath(videoPath)} -i ${escapePath(audioPath)} -c:v copy -map 0:v:0 -map 1:a:0 -shortest ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function extractAudio(inputPath, outputPath, format = "mp3") {
  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -vn -acodec libmp3lame -ab 192k ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

// ===========================================================================
// PROBE / INFO
// ===========================================================================

export function getMediaInfo(inputPath) {
  try {
    const output = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams ${escapePath(inputPath)}`,
      { encoding: "utf-8", timeout: 30000 }
    );
    return JSON.parse(output);
  } catch {
    return null;
  }
}

export function getDuration(inputPath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 ${escapePath(inputPath)}`,
      { encoding: "utf-8" }
    );
    return parseFloat(output.trim()) || 0;
  } catch {
    return 0;
  }
}

export function getResolution(inputPath) {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 ${escapePath(inputPath)}`,
      { encoding: "utf-8" }
    );
    return output.trim() || "unknown";
  } catch {
    return "unknown";
  }
}

// ===========================================================================
// EFFECTS
// ===========================================================================

export function addGradientOverlay(inputPath, outputPath, mood = "sunset") {
  let gradient;
  switch (mood?.toLowerCase()) {
    case "cyberpunk":
      gradient = "geq=r='150+105*sin(X/100+T)':g='20+20*sin(Y/100-T)':b='180+75*cos(X/200+T)'";
      break;
    case "ocean":
      gradient = "geq=r='10+10*sin(X/100+T)':g='100+80*sin(Y/150)':b='180+75*cos(X/150+T)'";
      break;
    case "velvet":
      gradient = "geq=r='60+40*sin(X/120+T/2)':g='10+10*sin(Y/200)':b='80+30*sin(X/100-T)'";
      break;
    default:
      gradient = "geq=r='220+35*sin(X/200+T)':g='100+70*sin(Y/150-T)':b='50+50*cos(X/100+T)'";
  }

  const overlay = `[0:v]format=rgba,colorchannelmixer=aa=0.4[bg];color=c=black:s=1080x1920:c=0x000000@0,${gradient},format=rgba[grad];[bg][grad]overlay=0:0:shortest=1,format=yuv420p[v]`;

  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -filter_complex "${overlay}" -map "[v]" -map 0:a -c:a copy ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function addVignette(inputPath, outputPath) {
  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -vf "vignette=PI/4" -c:a copy ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}

export function addFilmGrain(inputPath, outputPath) {
  execSync(
    `ffmpeg -y -i ${escapePath(inputPath)} -vf "noise=alls=10:allf=t+u" -c:a copy ${escapePath(outputPath)}`,
    { stdio: "ignore", timeout: 120000 }
  );
  return outputPath;
}
