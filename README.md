# Cauflia CLI

L'agent autonome de création vidéo — génère, télécharge, édite et monte des vidéos depuis le terminal.

## Fonctionnalités

- **Agent IA** — Génère une stratégie marketing + script vidéo en un prompt (Gemini)
- **Montage automatique** — Voix-off TTS française, gradients animés, sous-titres, musique
- **Édition vidéo** — Trim, concat, speed, crop, resize, overlays, effets
- **Téléchargement YouTube** — Télécharge vidéos et audio, extrait des clips
- **Médiathèque locale** — Gère tes fichiers vidéos, images, audio dans `~/cauflia-studio/`
- **Mode local** — Fonctionne complètement hors-ligne, SaaS optionnel

## Prérequis

- **Node.js** v18+
- **FFmpeg** — `winget install ffmpeg` ou `choco install ffmpeg`
- **yt-dlp** (optionnel, pour YouTube) — `winget install yt-dlp` ou `pip install yt-dlp`

## Installation

```bash
git clone https://github.com/alexisportelli/cauflia-cli.git
cd cauflia-cli
npm install
npm install -g .
```

## Utilisation

### Générer une vidéo avec l'IA

```bash
cauflia "Crée un TikTok sur le café de spécialité"
```

### Télécharger depuis YouTube

```bash
# Télécharger une vidéo
cauflia download "https://youtube.com/watch?v=..."

# Télécharger uniquement l'audio
cauflia download -a "https://youtube.com/watch?v=..."

# Extraire un clip (10s à 30s)
cauflia download -c 10-30 "https://youtube.com/watch?v=..."
```

### Gérer la médiathèque

```bash
# Voir les statistiques
cauflia library -s

# Lister les vidéos
cauflia library -l videos

# Importer un fichier
cauflia library -i video.mp4 -t videos

# Ouvrir le dossier
cauflia library --open
```

### Éditer une vidéo

```bash
# Couper un extrait
cauflia edit video.mp4 --trim 5-15 -o clip.mp4

# Concaténer plusieurs vidéos
cauflia edit video1.mp4 video2.mp4 --concat -o fusion.mp4

# Changer la vitesse
cauflia edit video.mp4 --speed 2 -o fast.mp4

# Ajouter un texte
cauflia edit video.mp4 --text "Mon texte" -o texte.mp4

# Ajouter un gradient
cauflia edit video.mp4 --gradient sunset -o stylise.mp4

# Mixer un audio
cauflia edit video.mp4 --audio musique.mp3 -o mix.mp4

# Voir les infos
cauflia edit video.mp4 --info

# Combiner plusieurs effets
cauflia edit video.mp4 --trim 10-30 --speed 1.5 --gradient cyberpunk --audio bg.mp3 -o final.mp4
```

### Configuration

```bash
# Configuration interactive
cauflia config

# Voir la config actuelle
cauflia config -s

# Définir les clés rapidement
cauflia config -g "AIzaSy..." -k "vc_..." -u "https://cauflia.app"
```

## Structure des fichiers

```
~/cauflia-studio/
  videos/     # Vidéos importées et téléchargées
  images/     # Images importées
  audio/      # Fichiers audio importés
  projects/   # Projets importés
  exports/    # Vidéos générées et éditées
  library-index.json  # Index de la médiathèque
```
