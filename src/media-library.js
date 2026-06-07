import fs from "fs";
import path from "path";
import os from "os";

const STUDIO_DIR = path.join(os.homedir(), "cauflia-studio");
const DIRS = {
  videos: path.join(STUDIO_DIR, "videos"),
  images: path.join(STUDIO_DIR, "images"),
  audio: path.join(STUDIO_DIR, "audio"),
  projects: path.join(STUDIO_DIR, "projects"),
  exports: path.join(STUDIO_DIR, "exports"),
};
const INDEX_FILE = path.join(STUDIO_DIR, "library-index.json");

function ensureDirs() {
  for (const dir of Object.values(DIRS)) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function loadIndex() {
  ensureDirs();
  if (!fs.existsSync(INDEX_FILE)) return { media: [], projects: [] };
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return { media: [], projects: [] };
  }
}

function saveIndex(index) {
  ensureDirs();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), "utf-8");
}

function scanDir(type) {
  const dir = DIRS[type];
  if (!dir || !fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => {
      const ext = path.extname(f).toLowerCase();
      if (type === "videos") return [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);
      if (type === "images") return [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext);
      if (type === "audio") return [".mp3", ".wav", ".ogg", ".aac", ".flac", ".m4a"].includes(ext);
      return false;
    })
    .map((f) => {
      const fullPath = path.join(dir, f);
      const stat = fs.statSync(fullPath);
      return {
        name: f,
        path: fullPath,
        size: stat.size,
        created: stat.birthtime || stat.ctime,
        modified: stat.mtime,
      };
    })
    .sort((a, b) => b.modified - a.modified);
}

export function addMedia(sourcePath, type) {
  const dir = DIRS[type];
  if (!dir) throw new Error(`Type inconnu: ${type}`);
  ensureDirs();

  const name = path.basename(sourcePath);
  const dest = path.join(dir, name);

  let counter = 1;
  let finalDest = dest;
  while (fs.existsSync(finalDest)) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    finalDest = path.join(dir, `${base}_${counter}${ext}`);
    counter++;
  }

  fs.copyFileSync(sourcePath, finalDest);
  
  const index = loadIndex();
  index.media.push({
    id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: path.basename(finalDest),
    path: finalDest,
    type,
    added: new Date().toISOString(),
    size: fs.statSync(finalDest).size,
  });
  saveIndex(index);

  return finalDest;
}

export function removeMedia(id) {
  const index = loadIndex();
  const idx = index.media.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  const media = index.media[idx];
  try { fs.unlinkSync(media.path); } catch {}
  index.media.splice(idx, 1);
  saveIndex(index);
  return true;
}

export function listMedia(type) {
  if (type) {
    const index = loadIndex();
    return index.media.filter((m) => m.type === type);
  }
  return loadIndex().media;
}

export function listOnDisk(type) {
  return scanDir(type);
}

export function importProject(sourcePath) {
  const dir = DIRS.projects;
  ensureDirs();
  const name = path.basename(sourcePath);
  const dest = path.join(dir, name);
  
  let counter = 1;
  let finalDest = dest;
  while (fs.existsSync(finalDest)) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    finalDest = path.join(dir, `${base}_${counter}${ext}`);
    counter++;
  }

  fs.copyFileSync(sourcePath, finalDest);

  const index = loadIndex();
  index.projects.push({
    id: `proj_${Date.now()}`,
    name: path.basename(finalDest),
    path: finalDest,
    added: new Date().toISOString(),
    size: fs.statSync(finalDest).size,
  });
  saveIndex(index);

  return finalDest;
}

export function getLibraryStats() {
  const videos = listOnDisk("videos");
  const images = listOnDisk("images");
  const audio = listOnDisk("audio");
  const projects = listOnDisk("projects");

  const totalSize = [...videos, ...images, ...audio, ...projects]
    .reduce((sum, f) => sum + f.size, 0);

  return { videos, images, audio, projects, totalSize, studioDir: STUDIO_DIR };
}

export function getDir(type) {
  ensureDirs();
  return DIRS[type] || STUDIO_DIR;
}

export { STUDIO_DIR, DIRS };
