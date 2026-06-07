import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { getDir, addMedia } from "./media-library.js";

function checkYtDlp() {
  try {
    execSync("yt-dlp --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export async function downloadYouTube(url, options = {}) {
  const {
    type = "video",
    quality = "best",
    outputName = null,
    clipStart = null,
    clipEnd = null,
  } = options;

  const videosDir = getDir("videos");
  const audioDir = getDir("audio");

  const hasYtDlp = checkYtDlp();

  if (!hasYtDlp) {
    throw new Error(
      "yt-dlp est requis. Installe-le avec:\n  winget install yt-dlp\n  ou: pip install yt-dlp"
    );
  }

  const baseName = outputName || `yt_${Date.now()}`;

  if (type === "audio") {
    const outputPath = path.join(audioDir, `${baseName}.%(ext)s`);
    const finalPath = path.join(audioDir, `${baseName}.mp3`);

    const args = [
      `"${url}"`,
      `-x`,
      `--audio-format mp3`,
      `--audio-quality 0`,
      `-o "${outputPath}"`,
      `--no-playlist`,
      `--print filename`,
    ];

    const result = execSync(`yt-dlp ${args.join(" ")}`, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 300000,
    }).trim();

    const downloadedFile = result.split("\n").pop() || finalPath;
    addMedia(downloadedFile, "audio");
    return { path: downloadedFile, type: "audio" };
  }

  // Download video
  const ext = quality === "best" ? "mp4" : "mp4";
  const outputPath = path.join(videosDir, `${baseName}.%(ext)s`);
  const finalPath = path.join(videosDir, `${baseName}.${ext}`);

  const formatOpt = quality === "best"
    ? "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
    : `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/best[height<=${quality}][ext=mp4]`;

  const args = [
    `"${url}"`,
    `-f "${formatOpt}"`,
    `--merge-output-format mp4`,
    `-o "${outputPath}"`,
    `--no-playlist`,
    `--print filename`,
  ];

  if (clipStart) args.push(`--download-sections "*${clipStart}-${clipEnd || clipStart + 30}"`);

  const result = execSync(`yt-dlp ${args.join(" ")}`, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 600000,
  }).trim();

  const downloadedFile = result.split("\n").pop() || finalPath;
  addMedia(downloadedFile, "videos");

  return { path: downloadedFile, type: "video" };
}

export async function listFormats(url) {
  const hasYtDlp = checkYtDlp();
  if (!hasYtDlp) throw new Error("yt-dlp n'est pas installé");

  const output = execSync(`yt-dlp -F "${url}"`, {
    encoding: "utf-8",
    timeout: 30000,
  });
  return output;
}

export async function getInfo(url) {
  const hasYtDlp = checkYtDlp();
  if (!hasYtDlp) throw new Error("yt-dlp n'est pas installé");

  const output = execSync(
    `yt-dlp --print-json -o "%(id)s.%(ext)s" --no-download "${url}"`,
    { encoding: "utf-8", timeout: 30000 }
  );
  return JSON.parse(output);
}
