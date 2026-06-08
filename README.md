# Cauflia 🤖

**Agent IA conversationnel de type OpenClaw** — Chatte avec une IA qui a un accès complet à ton terminal : exécute des commandes, lit/écrit des fichiers, génère et édite des vidéos, télécharge depuis YouTube, gère ta médiathèque.

## Fonctionnalités

- **💬 Chat IA temps réel** — Streaming des réponses, outils exécutés automatiquement
- **🖥️ Accès système** — Exécute des commandes shell, lit/écrit des fichiers, explore les dossiers
- **🎬 Génération vidéo IA** — Stratégie marketing + script + montage automatique (voix-off TTS, gradients, sous-titres, musique)
- **✂️ Édition vidéo** — Trim, concat, speed, crop, resize, overlays, effets (vignette, grain, gradients)
- **📥 Téléchargement YouTube** — Vidéos et audio, extraction de clips
- **📚 Médiathèque locale** — Gère tes fichiers dans `~/cauflia-studio/`
- **🌐 Mode local** — Fonctionne complètement hors-ligne (SaaS optionnel)

## Prérequis

- **Node.js** v18+
- **FFmpeg** — `winget install ffmpeg`
- **yt-dlp** (optionnel, pour YouTube) — `winget install yt-dlp`

## Installation

```bash
git clone https://github.com/alexisportelli/cauflia-cli.git
cd cauflia-cli
npm install
npm install -g .
```

Configure ta clé Gemini au premier lancement :

```bash
cauflia config
```

## Utilisation

### Lancer le chat interactif

```bash
# Démarre une session chat avec l'agent
cauflia

# Ou lance directement avec un prompt
cauflia "Crée un TikTok sur le café de spécialité"
```

Dans le chat, l'agent peut faire tout ça automatiquement :

```
👤 Vous ❯ Trouve les fichiers JS les plus récents dans le dossier src
👤 Vous ❯ Télécharge cette vidéo YouTube et extrais-en l'audio
👤 Vous ❯ Écris un script Python qui scrape ce site web
👤 Vous ❯ Concatène video1.mp4 et video2.mp4 avec un overlay texte
```

L'agent exécute les outils (commandes shell, lecture/écriture fichiers, édition vidéo, etc.) de manière totalement autonome et transparente — pas de confirmation demandée.

### Commandes directes (sans chat)

```bash
# Télécharger depuis YouTube
cauflia download "https://youtube.com/watch?v=..."
cauflia download -a "https://youtube.com/watch?v=..."
cauflia download -c 10-30 "https://youtube.com/watch?v=..."

# Gérer la médiathèque
cauflia library -s                          # Statistiques
cauflia library -l videos                   # Lister les vidéos
cauflia library -i video.mp4 -t videos      # Importer
cauflia library --open                      # Ouvrir le dossier

# Éditer une vidéo
cauflia edit video.mp4 --trim 5-15 -o clip.mp4
cauflia edit video1.mp4 video2.mp4 --concat -o fusion.mp4
cauflia edit video.mp4 --speed 2 -o fast.mp4
cauflia edit video.mp4 --text "Mon texte" -o texte.mp4
cauflia edit video.mp4 --gradient sunset -o stylise.mp4
cauflia edit video.mp4 --audio musique.mp3 -o mix.mp4
cauflia edit video.mp4 --info
cauflia edit video.mp4 --trim 10-30 --speed 1.5 --gradient cyberpunk --audio bg.mp3 -o final.mp4

# Configuration
cauflia config                               # Interactive
cauflia config -s                            # Voir config
cauflia config -g "AIzaSy..." -k "vc_..."   # Définir les clés
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
