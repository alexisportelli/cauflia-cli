# Cauflia CLI — Autopilot UGC en ligne de commande

> **L'agent UGC Autopilot pour founders & marques, depuis votre terminal.**

Cauflia CLI est l'interface en ligne de commande du pipeline **AI UGC Autopilot**. Il permet de scrapper, analyser, générer des scripts et produire des vidéos courtes de type fondateur/influenceur — le tout depuis un REPL conversationnel ou via des commandes directes.

---

## Prérequis

- **Node.js** v18+
- **FFmpeg** — `winget install ffmpeg`
- **yt-dlp** (optionnel) — `winget install yt-dlp`

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

## Utilisation — Mode Autopilot

### Brand Scan (analyse de marque)

```bash
# Analyse complète d'une marque depuis son URL
cauflia "Analyse le site https://exemple.com et construis le Brand Memory Graph"

# Extraction des propositions de valeur, ICP, objections, preuves
cauflia "Scrape https://exemple.com, trouve les pages, et extrais la stratégie marketing"
```

### Script Engine (génération de scripts)

```bash
# Génération de scripts multi-variantes
cauflia "Génère 10 scripts vidéo pour une SaaS B2B qui vend un outil de analytics"

# Scripts avec template spécifique
cauflia "Crée 3 scripts founder pitch pour présenter mon produit à des investisseurs"

# Script Problem/Solution
cauflia "Écris 5 scripts problem/solution pour un outil de gestion de projet"
```

### Production Vidéo

```bash
# Génération complète (script + voix-off + montage)
cauflia "Crée une vidéo TikTok de 30s présentant mon SaaS"

# Avec template et voix
cauflia "Génère une vidéo format problem/solution avec voix-off féminine"

# Pipeline complet
cauflia "Analyse mon site https://ma-boite.com, génère 5 scripts, et rend la meilleure vidéo"
```

### Édition & Post-production

```bash
# Découper un clip
cauflia edit video.mp4 --trim 5-15 -o clip.mp4

# Concaténer
cauflia edit intro.mp4 body.mp4 cta.mp4 --concat -o final.mp4

# Ajouter voix-off, sous-titres, musique
cauflia edit video.mp4 --audio voix-off.mp3 --subtitles -o social.mp4

# Accélérer, redimensionner, ajouter du texte
cauflia edit video.mp4 --speed 1.5 --text "Mon texte" --gradient sunset -o stylise.mp4
```

### YouTube & Média

```bash
# Télécharger
cauflia download "https://youtube.com/watch?v=..."
cauflia download -a "https://youtube.com/watch?v=..."  # Audio only
cauflia download -c 10-30 "https://youtube.com/watch?v=..."  # Clip

# Gérer la médiathèque
cauflia library -s                          # Statistiques
cauflia library -l videos                   # Lister
cauflia library -i video.mp4 -t videos      # Importer
cauflia library --open                      # Ouvrir le dossier
```

## Mode REPL Conversationnel

Lance un chat interactif avec l'agent :

```bash
cauflia
```

Dans le REPL, l'agent peut :
- Analyser des sites web et construire des Brand Memory Graphs
- Générer des scripts UGC pour les 4 templates (founder pitch, problem/solution, témoignage, walkthrough)
- Produire des vidéos complètes avec voix-off, sous-titres, B-roll
- Éditer et monter des vidéos
- Télécharger et gérer des médias

## Architecture Agent

Le CLI utilise les mêmes agents que la plateforme SaaS :

| Agent | Rôle |
|-------|------|
| **Brand Analyst** | Scrape + synthèse de la marque |
| **Offer Strategist** | Angles marketing et objections |
| **Script Writer** | Scripts multi-variantes |
| **Casting Agent** | Avatar, voix, ton |
| **Video Director** | Template, scènes, montage |
| **Critic Agent** | Scoring et refus des sorties faibles |

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

## Stack

- **Runtime** : Node.js ESM
- **IA** : `@google/generative-ai` (Gemini) + API OpenAI-compatible (Anthropic, OpenRouter, Ollama)
- **CLI** : Commander.js, `@clack/prompts`, picocolors
- **Vidéo** : FFmpeg, yt-dlp, Pexels API, Google Translate TTS
- **Config** : `~/.config/cauflia/config.json`

## Licence

MIT — Cauflia Team & Alexis Portelli.
