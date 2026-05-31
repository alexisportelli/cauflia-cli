# 🎬 Velocity Video — Opencode Skill

Skill de montage vidéo IA pour Opencode. Connecte-toi à VelocityContent SaaS et monte tes vidéos depuis le terminal avec des agents IA.

## Fonctionnalités

- **🎬 Montage automatique** — L'IA analyse tes vidéos et crée un montage optimisé
- **✨ Motion Design** — Ken Burns, zoom/pan, split screen, lower thirds, text overlays
- **🎵 Gestion Audio** — Mixage, réduction de bruit, normalisation, extraction, musique de fond
- **🎨 Effets Visuels** — Correction couleur, N&B, sépia, vignetage, flou, chroma key
- **📤 Export** — MP4, MOV, WebM, GIF — plusieurs qualités
- **🤖 Agents IA** — Analyse de scènes, suggestions musicales, recommandations d'effets

## Installation

```powershell
# Option 1 : Installation automatisée
.\install.ps1

# Option 2 : Manuel
pip install -r requirements.txt
```

## Utilisation

### Depuis Opencode
1. Lance `opencode`
2. Tape "monter une video", "velocity", ou "montage"
3. Le skill se lance automatiquement

### En ligne de commande
```powershell
python velocity_video.py
```

### Workflow typique
1. **Connexion** → Entre ton email/mot de passe VelocityContent
2. **Sélection** → Choisis les vidéos à monter (locales ou SaaS)
3. **Style** → viral, cinematic, fast, slow, corporate
4. **Musique** → Choisis l'ambiance musicale
5. **Rendu** → L'IA assemble tout automatiquement

## Architecture

```
┌─────────────────────────────────────────────┐
│           Opencode Skill (CLI)              │
│  velocity_video.py — interface utilisateur  │
├─────────────────────────────────────────────┤
│           Agents IA                         │
│  scene_detector  │  music_suggester         │
│  effect_recommender  │  auto_editor         │
├─────────────────────────────────────────────┤
│           Moteur de Rendu                   │
│  FFmpeg (local)  │  Velocity Engine (SaaS)  │
├─────────────────────────────────────────────┤
│           SaaS VelocityContent              │
│  API REST  │  Supabase  │  Edge Functions   │
└─────────────────────────────────────────────┘
```

## Configuration

Les paramètres sont stockés dans `~/.config/velocity-video/config.json`.

## Prérequis

- Python 3.9+
- FFmpeg (pour le rendu local, optionnel si tu utilises le moteur SaaS)
- Opencode (dernière version)

## Licence

MIT — Fais-en ce que tu veux !
