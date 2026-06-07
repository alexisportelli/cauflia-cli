# 🎬 CAUFLIA CLI - L'Agent Vidéo Autonome

Cauflia est un agent autonome en ligne de commande qui transforme une simple idée en vidéo complète avec stratégie marketing, voix-off, musique et sous-titres.

En un seul prompt, l'agent crée ta stratégie marketing, rédige un script de voix-off captivant, génère tes premières scènes vidéo animées avec des dégradés de couleurs fluides, ajoute une voix off française réaliste ainsi qu'une musique d'ambiance, et envoie le tout au SaaS pour validation avant publication !

---

## 🚀 Fonctionnalités

1. **Stratégie & Scripts Instantanés :** Analyse ton besoin grâce à Google Gemini pour bâtir une stratégie TikTok / Reels ultra-virale.
2. **Montage Vidéo Local (FFmpeg) :**
   - **Voix-off :** Synthétise automatiquement des fichiers audio voix-off français fluides grâce à une intégration TTS gratuite.
   - **Images/Gradients :** Crée des animations vidéo verticales (9:16) stylisées avec des gradients de couleur en mouvement synchronisés à la voix-off.
   - **Sous-titres :** Ajoute des overlays textuels stylisés directement sur les vidéos (style Alex Hormozi).
   - **Musique :** Sélectionne et mixe une musique de fond appropriée (Lofi, Synthwave, Cinematic) avec réduction du bruit de fond.
3. **Validation par le SaaS :** Pousse un nouveau projet vidéo et déclenche une notification temps réel sur le tableau de bord VelocityContent. Tu n'as plus qu'à cliquer pour approuver ou éditer !

---

## 🛠 Prérequis

Assure-toi d'avoir installé sur ta machine :
1. **Node.js** (v18 ou supérieur)
2. **NPM**
3. **FFmpeg** (nécessaire pour le montage vidéo local). Vérifie sa présence en écrivant `ffmpeg -version` dans ton terminal.

---

## 📦 Installation

1. Télécharge ou clone ce dossier :
   ```bash
   git clone https://github.com/alexisportelli/cauflia.git
   cd cauflia
   ```

2. Installe les dépendances du projet :
   ```bash
   npm install
   ```

3. Lie la commande `cauflia` globalement à ton système :
   ```bash
   npm install -g .
   ```

---

## 🔑 Configuration

Lors du premier lancement, ou via la commande de configuration, tu devras renseigner tes clés API :

```bash
cauflia config
```

Il te sera demandé :
- **Clé API VelocityContent :** Générée directement dans l'onglet **Intégrations** de ton SaaS (`vc_...`).
- **Clé API Google Gemini :** Pour alimenter l'agent décisionnel et créatif.
- **URL de ton SaaS :** Par exemple, `http://localhost:3000`.

---

## ⚡ Utilisation

Pour lancer la création d'un projet, écris simplement `cauflia` suivi de ton prompt entre guillemets, ou lance-le sans arguments pour entrer en mode interactif :

```bash
cauflia "Crée un TikTok sur le café de spécialité et pourquoi c'est meilleur que le café industriel"
```

### Déroulement de l'agent :
1. **Génération de l'idée :** L'agent conçoit la stratégie TikTok et l'affiche à l'écran.
2. **Écriture du script :** Découpage de la vidéo en scènes (visuels, textes, audio).
3. **Montage de la vidéo :** Synthèse de la voix-off française + rendu des dégradés vidéo + intégration de la musique et sous-titres avec FFmpeg.
4. **Synchronisation SaaS :** Envoi d'une notification push instantanée sur VelocityContent avec un bouton **Examiner & Publier** !
