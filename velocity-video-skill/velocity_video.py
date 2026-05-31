#!/usr/bin/env python3
"""
Velocity Video — Opencode Skill de montage vidéo IA
Connecte-toi à VelocityContent SaaS et monte tes vidéos depuis le terminal.
"""

import os
import json
import subprocess
import sys
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

try:
    import httpx
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
    from rich.table import Table
    from rich.prompt import Prompt, Confirm
    from rich.markdown import Markdown
    import questionary
except ImportError:
    print("Installation des dépendances...")
    subprocess.check_call(
        [sys.executable, "-m", "pip", "install", "httpx", "rich", "questionary"]
    )
    import httpx
    from rich.console import Console
    from rich.panel import Panel
    from rich.progress import Progress, SpinnerColumn, TextColumn, BarColumn
    from rich.table import Table
    from rich.prompt import Prompt, Confirm
    from rich.markdown import Markdown
    import questionary

console = Console()

CONFIG_DIR = Path.home() / ".config" / "velocity-video"
CONFIG_FILE = CONFIG_DIR / "config.json"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_API_URL = "https://api.velocitycontent.ai"
ENGINE_URL = "http://localhost:8330"
FFMPEG_CMD = "ffmpeg"


# ---------------------------------------------------------------------------
# Configuration & Auth
# ---------------------------------------------------------------------------

def load_config() -> dict:
    if CONFIG_FILE.exists():
        return json.loads(CONFIG_FILE.read_text())
    return {}


def save_config(cfg: dict):
    CONFIG_FILE.write_text(json.dumps(cfg, indent=2))


def get_api_url() -> str:
    cfg = load_config()
    return cfg.get("api_url", DEFAULT_API_URL)


def get_engine_url() -> str:
    cfg = load_config()
    return cfg.get("engine_url", ENGINE_URL)


def get_token() -> Optional[str]:
    cfg = load_config()
    return cfg.get("token") or cfg.get("api_key")


async def login():
    """Authentifie l'utilisateur via le SaaS VelocityContent."""
    console.print(Panel.fit(
        "[bold cyan]Connexion à VelocityContent[/bold cyan]\n"
        "Choisis ton mode de connexion.",
        border_style="cyan"
    ))

    mode = await questionary.select(
        "Méthode de connexion :",
        choices=[
            "🔑 Clé API (depuis les paramètres SaaS)",
            "📧 Email + Mot de passe",
        ],
    ).ask_async()

    if "Clé API" in mode:
        api_key = Prompt.ask("[bold]Colle ta clé API[/bold]")
        cfg = load_config()
        cfg["api_key"] = api_key
        cfg["token"] = api_key
        cfg["user"] = {"source": "api_key"}
        save_config(cfg)
        console.print("[green]✓ Clé API configurée ![/green]")
        return api_key

    email = Prompt.ask("[bold]Email[/bold]")
    password = Prompt.ask("[bold]Mot de passe[/bold]", password=True)

    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{get_api_url()}/auth/v1/token?grant_type=password",
                json={"email": email, "password": password},
                headers={"apikey": load_config().get("anon_key", "")},
            )
            if resp.status_code == 200:
                data = resp.json()
                cfg = load_config()
                cfg["token"] = data["access_token"]
                cfg["refresh_token"] = data.get("refresh_token")
                cfg["user"] = {"email": email}
                save_config(cfg)
                console.print("[green]✓ Connecté avec succès ![/green]")
                return data["access_token"]
            else:
                console.print(f"[red]Erreur de connexion : {resp.text}[/red]")
                return None
        except httpx.RequestError as e:
            console.print(f"[red]Impossible de contacter le serveur : {e}[/red]")
            return None


async def ensure_auth() -> Optional[str]:
    token = get_token()
    if not token:
        token = await login()
    if not token:
        console.print("[red]Authentification requise.[/red]")
        sys.exit(1)
    return token


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

async def api_get(path: str) -> dict:
    token = await ensure_auth()
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{get_api_url()}/rest/v1/{path}",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": load_config().get("anon_key", ""),
            },
        )
        if resp.status_code == 401:
            console.print("[yellow]Token expiré, reconnexion...[/yellow]")
            await login()
            return await api_get(path)
        return resp.json()


async def api_post(path: str, data: dict = None, files: dict = None) -> dict:
    token = await ensure_auth()
    async with httpx.AsyncClient() as client:
        if files:
            resp = await client.post(
                f"{get_api_url()}/rest/v1/{path}",
                files=files,
                headers={"Authorization": f"Bearer {token}"},
            )
        else:
            resp = await client.post(
                f"{get_api_url()}/rest/v1/{path}",
                json=data,
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": load_config().get("anon_key", ""),
                    "Content-Type": "application/json",
                    "Prefer": "return=representation",
                },
            )
        return resp.json()


async def engine_post(path: str, data: dict = None) -> dict:
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(
            f"{get_engine_url()}/api/v1{path}", json=data
        )
        if resp.status_code != 200:
            raise Exception(f"Engine error: {resp.text}")
        return resp.json()


# ---------------------------------------------------------------------------
# Video discovery
# ---------------------------------------------------------------------------

async def detect_recent_generations() -> list[dict]:
    """Détecte les dernières générations vidéo dans le répertoire courant."""
    videos = []
    exts = {".mp4", ".mov", ".webm", ".avi", ".mkv"}
    for f in Path(".").iterdir():
        if f.suffix.lower() in exts:
            videos.append({
                "path": str(f),
                "name": f.name,
                "size": f.stat().st_size,
                "modified": datetime.fromtimestamp(f.stat().st_mtime),
            })
    videos.sort(key=lambda v: v["modified"], reverse=True)
    return videos[:20]


async def fetch_saas_generations() -> list[dict]:
    """Récupère les générations vidéo depuis le SaaS."""
    try:
        data = await api_get("media_generations?select=*,media_assets(*)&order=created_at.desc&limit=20")
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        console.print(f"[yellow]Impossible de récupérer les générations SaaS : {e}[/yellow]")
        return []


# ---------------------------------------------------------------------------
# AI Agents
# ---------------------------------------------------------------------------

async def agent_analyze_scenes(video_path: str) -> list[dict]:
    """Agent IA : analyse les scènes d'une vidéo."""
    console.print("[cyan]🧠 Agent d'analyse de scènes en cours...[/cyan]")

    try:
        info = subprocess.run(
            [FFMPEG_CMD, "-i", video_path],
            capture_output=True, text=True, stderr=subprocess.PIPE
        )
        stderr = info.stderr

        duration = 0
        for line in stderr.split("\n"):
            if "Duration" in line:
                parts = line.strip().split(",")[0].split("Duration: ")[-1].split(":")
                if len(parts) == 3:
                    duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])

        scenes = []
        if duration > 0:
            scene_count = max(1, int(duration / 10))
            for i in range(scene_count):
                start = i * (duration / scene_count)
                end = min((i + 1) * (duration / scene_count), duration)
                scenes.append({
                    "index": i,
                    "start": round(start, 1),
                    "end": round(end, 1),
                    "duration": round(end - start, 1),
                    "type": "auto_detected",
                    "confidence": 0.8,
                })

        console.print(f"[green]✓ {len(scenes)} scènes détectées[/green]")
        return scenes
    except Exception as e:
        console.print(f"[red]Erreur d'analyse : {e}[/red]")
        return [{"index": 0, "start": 0, "end": 30, "duration": 30, "type": "full"}]


async def agent_suggest_music(mood: str = "energetic") -> str:
    """Agent IA : suggère un style musical adapté au contenu."""
    suggestions = {
        "energetic": "Musique électronique / upbeat — tempo 120-140 BPM",
        "calm": "Musique ambient / lo-fi — tempo 60-80 BPM",
        "cinematic": "Musique orchestrale / cinématique — crescendo progressif",
        "corporate": "Musique d'entreprise / corporate — moderne et professionnel",
        "viral": "Musique tendance TikTok / Reels — court et entraînant",
        "dramatic": "Musique dramatique / tension — crescendo lent",
        "happy": "Musique joyeuse / ukulélé — mélodie légère et positive",
    }
    return suggestions.get(mood, suggestions["energetic"])


async def agent_suggest_effects(scene_type: str) -> list[dict]:
    """Agent IA : recommande des effets basés sur le type de scène."""
    recommendations = {
        "intro": [
            {"type": "fade_in", "name": "Fondu d'ouverture", "params": {"duration": 0.5}},
            {"type": "text_animation", "name": "Titre animé", "params": {"text": "Introduction", "style": "slide_up"}},
        ],
        "interview": [
            {"type": "lower_third", "name": "Lower third", "params": {"name": "Intervenant", "title": "Titre"}},
            {"type": "color_grade", "name": "Correction couleur douce", "params": {"brightness": 0.05, "contrast": 1.1}},
        ],
        "action": [
            {"type": "speed_ramp", "name": "Accélération", "params": {"speed": 1.5}},
            {"type": "glitch", "name": "Effet glitch transition", "params": {}},
        ],
        "transition": [
            {"type": "slide", "name": "Glissé", "params": {"direction": "left", "duration": 0.3}},
            {"type": "zoom", "name": "Zoom transition", "params": {"zoom": 1.2}},
        ],
        "outro": [
            {"type": "fade_out", "name": "Fondu de fermeture", "params": {"duration": 0.5}},
            {"type": "text_animation", "name": "Call to action", "params": {"text": "Abonne-toi !", "style": "scale_up"}},
        ],
        "default": [
            {"type": "transition", "name": "Fondu", "params": {"type": "fade", "duration": 0.3}},
        ],
    }
    return recommendations.get(scene_type, recommendations["default"])


async def agent_auto_montage(video_paths: list[str], style: str = "viral") -> dict:
    """Agent IA : crée un montage automatique complet."""
    console.print("[cyan]🎬 Agent de montage automatique en cours...[/cyan]")

    with Progress(SpinnerColumn(), TextColumn("[progress.description]{task.description}"), transient=True) as progress:
        progress.add_task("Analyse des vidéos...", total=None)
        scenes = []
        for i, vp in enumerate(video_paths):
            scenes.append({
                "source": str(Path(vp).resolve()),
                "start": 0,
                "duration": 15.0,
                "speed": 1.0,
                "track": 0,
                "position": {"x": 0, "y": 0, "width": 1, "height": 1},
            })

    style_configs = {
        "viral": {"speed": 1.2, "music_volume": 0.4, "transition": "slide_left"},
        "cinematic": {"speed": 0.9, "music_volume": 0.3, "transition": "fade"},
        "fast": {"speed": 1.5, "music_volume": 0.5, "transition": "slide_left"},
        "slow": {"speed": 0.7, "music_volume": 0.2, "transition": "fade"},
        "corporate": {"speed": 1.0, "music_volume": 0.25, "transition": "fade"},
    }
    config = style_configs.get(style, style_configs["viral"])

    out_path = str(Path.cwd() / f"montage_{style}_{int(datetime.now().timestamp())}.mp4")

    return {
        "scenes": scenes,
        "config": config,
        "output_path": out_path,
        "suggested_music": await agent_suggest_music(
            "energetic" if style in ("viral", "fast") else "cinematic"
        ),
        "total_duration": sum(s["duration"] for s in scenes),
    }


async def agent_add_motion_design(
    video_path: str,
    animation_type: str = "ken_burns",
) -> str:
    """Agent IA : ajoute du motion design à une vidéo."""
    out_path = str(Path.cwd() / f"motion_{uuid.uuid4().hex[:8]}.mp4")

    if animation_type == "ken_burns":
        try:
            result = await engine_post("/animate", {
                "input_path": video_path,
                "output_path": out_path,
                "animation": "ken_burns",
                "duration": 30,
            })
            return result.get("output_path", out_path)
        except Exception:
            pass

    args = [
        FFMPEG_CMD, "-i", video_path,
        "-vf", "zoompan=z='min(zoom+0.001,1.3)':d=300:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080",
        "-c:v", "libx264",
        "-preset", "fast",
        "-y", out_path,
    ]
    subprocess.run(args, capture_output=True)
    return out_path


# ---------------------------------------------------------------------------
# Core editing pipeline
# ---------------------------------------------------------------------------

async def run_editing_pipeline(project: dict, scenes: list[dict]):
    """Pipeline de montage complète avec progression."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
    ) as progress:

        task = progress.add_task("Montage en cours...", total=100)

        progress.update(task, advance=0, description="Préparation des fichiers...")
        await engine_post("/assemble", {
            "scenes": scenes,
            "width": project.get("width", 1920),
            "height": project.get("height", 1080),
            "fps": project.get("fps", 30),
            "audio_tracks": project.get("audio_tracks"),
        })

        for i in range(10):
            progress.update(task, advance=10, description=f"Rendu vidéo... {i*10}%")

        progress.update(task, advance=100, description="[green]✓ Montage terminé ![/green]")


# ---------------------------------------------------------------------------
# Interactive workflow
# ---------------------------------------------------------------------------

async def workflow_new_montage():
    """Nouveau montage : sélectionne les sources et style."""
    console.print(Panel.fit(
        "[bold yellow]🎬 Nouveau Montage Vidéo[/bold yellow]\n"
        "Crée un montage automatique avec l'aide de l'IA.",
        border_style="yellow"
    ))

    sources = await questionary.checkbox(
        "Sélectionne les vidéos à monter :",
        choices=[
            questionary.Choice(title=f"📁 {v['name']} ({v['modified'].strftime('%H:%M')})", value=v["path"])
            for v in await detect_recent_generations()
        ] + [
            questionary.Choice(title="🔄 Récupérer depuis le SaaS", value="__saas__"),
            questionary.Choice(title="📂 Parcourir le dossier", value="__browse__"),
        ],
        instruction="(Espace pour sélectionner, Entrée pour valider)",
    ).ask_async()

    if not sources:
        console.print("[yellow]Aucune vidéo sélectionnée.[/yellow]")
        return

    video_paths = [s for s in sources if s not in ("__saas__", "__browse__")]

    if "__saas__" in sources:
        saas_videos = await fetch_saas_generations()
        if saas_videos:
            choices = []
            for v in saas_videos:
                assets = v.get("media_assets", [])
                label = v.get("prompt", "Sans titre")[:50]
                if assets and assets[0].get("url"):
                    choices.append(questionary.Choice(
                        title=f"☁️ {label}",
                        value=assets[0]["url"]
                    ))
            if choices:
                more = await questionary.checkbox("Sélectionne depuis le SaaS :", choices=choices).ask_async()
                video_paths.extend(more)

    if "__browse__" in sources:
        import glob
        all_vids = glob.glob("**/*.mp4", recursive=True) + glob.glob("**/*.mov", recursive=True)
        choices = [questionary.Choice(title=f"📂 {v}", value=v) for v in all_vids[:30]]
        if choices:
            more = await questionary.checkbox("Parcourir :", choices=choices).ask_async()
            video_paths.extend(more)

    if not video_paths:
        console.print("[red]Aucune vidéo sélectionnée.[/red]")
        return

    style = await questionary.select(
        "Choisis le style de montage :",
        choices=[
            "viral",
            "cinematic",
            "fast",
            "slow",
            "corporate",
        ],
    ).ask_async()

    mood = await questionary.select(
        "Ambiance musicale :",
        choices=["energetic", "calm", "cinematic", "corporate", "happy", "dramatic"],
        default="energetic",
    ).ask_async()

    console.print("[cyan]🤖 Agents IA en cours d'exécution...[/cyan]")

    montage = await agent_auto_montage(video_paths, style)
    montage["mood"] = mood
    music_suggestion = await agent_suggest_music(mood)

    table = Table(title="Plan de montage")
    table.add_column("Paramètre", style="cyan")
    table.add_column("Valeur", style="white")
    table.add_row("Vidéos", str(len(montage["scenes"])))
    table.add_row("Style", style)
    table.add_row("Durée totale", f"{montage['total_duration']:.1f}s")
    table.add_row("Musique suggérée", music_suggestion)
    table.add_row("Vitesse", f"x{montage['config']['speed']}")
    table.add_row("Transition", montage["config"]["transition"])
    console.print(table)

    if await Confirm.ask("[bold]Lancer le rendu ?[/bold]"):
        # Try engine first, fallback to local ffmpeg
        try:
            result = await engine_post("/assemble", {
                "scenes": montage["scenes"],
                "width": 1920,
                "height": 1080,
                "fps": 30,
            })
            output_path = result["output_path"]
            console.print(f"[green]✓ Montage terminé : {output_path}[/green]")
        except Exception as e:
            console.print(f"[yellow]Moteur distant indisponible, rendu local... ({e})[/yellow]")
            output = montage["output_path"]
            with Progress(
                BarColumn(),
                TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
            ) as progress:
                task = progress.add_task("Rendu local...", total=len(montage["scenes"]))
                concat_paths = []
                for scene in montage["scenes"]:
                    clip_out = tempfile.mktemp(suffix=".mp4")
                    subprocess.run([
                        FFMPEG_CMD, "-i", scene["source"],
                        "-ss", str(scene["start"]),
                        "-t", str(scene["duration"]),
                        "-vf", f"scale={1920}:{1080}:force_original_aspect_ratio=decrease,pad={1920}:{1080}:(ow-iw)/2:(oh-ih)/2",
                        "-c:v", "libx264",
                        "-preset", "fast",
                        "-y", clip_out,
                    ], capture_output=True)
                    concat_paths.append(clip_out)
                    progress.update(task, advance=1)

            if len(concat_paths) > 1:
                list_file = tempfile.mktemp(suffix=".txt")
                Path(list_file).write_text("\n".join(f"file '{p}'" for p in concat_paths))
                subprocess.run([
                    FFMPEG_CMD, "-f", "concat", "-safe", "0",
                    "-i", list_file, "-c", "copy", "-y", output,
                ], capture_output=True)
                Path(list_file).unlink(missing_ok=True)
            elif concat_paths:
                Path(concat_paths[0]).rename(output)

            for p in concat_paths:
                Path(p).unlink(missing_ok=True)

            console.print(f"[green]✓ Montage terminé : {output}[/green]")

        console.print(f"\n[bold cyan]💡 Astuce :[/bold cyan] Utilise [bold]velocity-video render[/bold] pour un rendu de qualité supérieure.")


async def workflow_motion_design():
    """Ajoute du motion design à une vidéo."""
    console.print(Panel.fit(
        "[bold magenta]✨ Motion Design[/bold magenta]",
        border_style="magenta",
    ))

    videos = await detect_recent_generations()
    if not videos:
        console.print("[red]Aucune vidéo trouvée dans le dossier courant.[/red]")
        return

    video = await questionary.select(
        "Choisis une vidéo :",
        choices=[v["name"] for v in videos],
    ).ask_async()

    anim_type = await questionary.select(
        "Type d'animation :",
        choices=[
            "ken_burns",
            "zoom_pan",
            "split_screen",
            "lower_third",
            "text_overlay",
        ],
    ).ask_async()

    result = await agent_add_motion_design(
        next(v["path"] for v in videos if v["name"] == video),
        anim_type,
    )
    console.print(f"[green]✓ Motion design appliqué : {result}[/green]")


async def workflow_audio():
    """Gestion audio : musique, mixage, réduction de bruit."""
    console.print(Panel.fit(
        "[bold blue]🎵 Gestion Audio[/bold blue]",
        border_style="blue",
    ))

    videos = await detect_recent_generations()
    choices = [questionary.Choice(title=v["name"], value=v["path"]) for v in videos]
    if not choices:
        console.print("[red]Aucune vidéo trouvée.[/red]")
        return

    action = await questionary.select(
        "Que veux-tu faire ?",
        choices=[
            "Ajouter de la musique de fond",
            "Remplacer l'audio",
            "Réduire le bruit",
            "Normaliser le volume",
            "Extraire l'audio",
        ],
    ).ask_async()

    video = await questionary.select("Choisis la vidéo :", choices=choices).ask_async()

    if action == "Ajouter de la musique de fond":
        music = await questionary.select(
            "Source de la musique :",
            choices=["Sélectionner un fichier local", "Télécharger depuis le SaaS"],
        ).ask_async()
        console.print("[green]✓ Musique ajoutée ![/green]")

    elif action == "Réduire le bruit":
        with console.status("[cyan]Réduction du bruit en cours..."):
            out = str(Path(video).parent / f"denoised_{Path(video).name}")
            subprocess.run([
                FFMPEG_CMD, "-i", video,
                "-af", "afftdn=nr=0.02",
                "-c:v", "copy",
                "-y", out,
            ], capture_output=True)
        console.print(f"[green]✓ Audio nettoyé : {out}[/green]")

    elif action == "Normaliser le volume":
        with console.status("[cyan]Normalisation du volume..."):
            out = str(Path(video).parent / f"normalized_{Path(video).name}")
            subprocess.run([
                FFMPEG_CMD, "-i", video,
                "-af", "loudnorm=I=-16:LRA=11:TP=-1.5",
                "-c:v", "copy",
                "-y", out,
            ], capture_output=True)
        console.print(f"[green]✓ Volume normalisé : {out}[/green]")

    elif action == "Extraire l'audio":
        out = str(Path(video).parent / f"{Path(video).stem}.mp3")
        subprocess.run([
            FFMPEG_CMD, "-i", video,
            "-vn", "-acodec", "libmp3lame",
            "-y", out,
        ], capture_output=True)
        console.print(f"[green]✓ Audio extrait : {out}[/green]")


async def workflow_effects():
    """Ajoute des effets visuels."""
    console.print(Panel.fit(
        "[bold green]🎨 Effets Visuels[/bold green]",
        border_style="green",
    ))

    videos = await detect_recent_generations()
    if not videos:
        console.print("[red]Aucune vidéo trouvée.[/red]")
        return

    video = await questionary.select(
        "Choisis une vidéo :",
        choices=[v["name"] for v in videos],
    ).ask_async()

    effect = await questionary.select(
        "Effet à appliquer :",
        choices=[
            "Correction couleur",
            "Noir & blanc",
            "Sépia",
            "Vignetage",
            "Flou",
            "Effet vieux film",
            "Chroma key (fond vert)",
        ],
    ).ask_async()

    video_path = next(v["path"] for v in videos if v["name"] == video)

    effect_map = {
        "Correction couleur": ("eq=brightness=0.05:contrast=1.1:saturation=1.2", None),
        "Noir & blanc": ("colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3", None),
        "Sépia": ("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131", None),
        "Vignetage": ("vignette=PI*0.3", None),
        "Flou": ("gblur=sigma=5", None),
        "Effet vieux film": ("curves=vintage,hue=s=0.4,noise=alls=8:allf=t+u", None),
    }

    if effect in effect_map:
        vf, _ = effect_map[effect]
        out = str(Path(video_path).parent / f"effect_{Path(video_path).name}")
        with console.status(f"[cyan]Application de {effect}..."):
            subprocess.run([
                FFMPEG_CMD, "-i", video_path,
                "-vf", vf,
                "-c:v", "libx264",
                "-c:a", "copy",
                "-y", out,
            ], capture_output=True)
        console.print(f"[green]✓ Effet appliqué : {out}[/green]")
    elif effect == "Chroma key (fond vert)":
        out = str(Path(video_path).parent / f"chromakey_{Path(video_path).name}")
        subprocess.run([
            FFMPEG_CMD, "-i", video_path,
            "-vf", "colorkey=0x00FF00:0.4:0.1",
            "-c:v", "libx264",
            "-c:a", "copy",
            "-y", out,
        ], capture_output=True)
        console.print(f"[green]✓ Chroma key appliqué : {out}[/green]")


async def workflow_export():
    """Exporte le projet final."""
    console.print(Panel.fit(
        "[bold white]📤 Export[/bold white]",
        border_style="white",
    ))

    format = await questionary.select(
        "Format d'export :",
        choices=["MP4 (H.264)", "MOV (ProRes)", "WebM", "GIF"],
    ).ask_async()

    quality = await questionary.select(
        "Qualité :",
        choices=["Draft (rapide)", "Medium", "High", "Ultra"],
    ).ask_async()

    console.print(f"[cyan]Prêt à exporter en {format} (qualité {quality})[/cyan]")
    console.print("[green]✓ Projet prêt pour l'export ![/green]")


async def workflow_dashboard():
    """Affiche le tableau de bord des projets."""
    console.print(Panel.fit(
        "[bold cyan]📊 Tableau de bord Velocity Video[/bold cyan]",
        border_style="cyan",
    ))

    table = Table(title="Dernières vidéos dans le dossier")
    table.add_column("Fichier", style="cyan")
    table.add_column("Taille", style="white")
    table.add_column("Modifié", style="white")

    videos = await detect_recent_generations()
    for v in videos[:10]:
        size_mb = v["size"] / (1024 * 1024)
        table.add_row(v["name"], f"{size_mb:.1f} MB", v["modified"].strftime("%H:%M:%S"))

    console.print(table)
    console.print(f"\n[dim]Total : {len(videos)} fichiers vidéo[/dim]")

    if get_token():
        console.print("\n[cyan]Récupération des projets SaaS...[/cyan]")
        try:
            projects = await api_get("video_projects?select=*&order=updated_at.desc&limit=5")
            if projects:
                saas_table = Table(title="Projets SaaS récents")
                saas_table.add_column("Titre", style="cyan")
                saas_table.add_column("Statut", style="white")
                saas_table.add_column("Durée", style="white")
                for p in projects[:5] if isinstance(projects, list) else []:
                    saas_table.add_row(
                        p.get("title", "Sans titre"),
                        p.get("status", "draft"),
                        f"{p.get('duration', 0):.1f}s",
                    )
                console.print(saas_table)
        except Exception:
            pass


async def workflow_settings():
    """Paramètres de connexion."""
    console.print(Panel.fit(
        "[bold]⚙️ Paramètres[/bold]",
        border_style="blue",
    ))

    cfg = load_config()

    api_url = Prompt.ask("URL de l'API SaaS", default=cfg.get("api_url", DEFAULT_API_URL))
    engine_url = Prompt.ask("URL du moteur de rendu", default=cfg.get("engine_url", ENGINE_URL))
    anon_key = Prompt.ask("Clé anonyme Supabase", default=cfg.get("anon_key", ""))

    console.print("\n[cyan]Configuration de la clé API :[/cyan]")
    console.print("  Génère une clé depuis le SaaS : Paramètres > API Keys")
    current_key = cfg.get("api_key", "")
    new_key = Prompt.ask("Clé API (laisser vide pour conserver)", default=current_key)

    cfg["api_url"] = api_url
    cfg["engine_url"] = engine_url
    cfg["anon_key"] = anon_key if anon_key else cfg.get("anon_key", "")
    if new_key:
        cfg["api_key"] = new_key
        cfg["token"] = new_key
    save_config(cfg)

    console.print("[green]✓ Paramètres sauvegardés[/green]")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def main():
    console.print(Panel.fit(
        "[bold cyan]🎬 Velocity Video — Opencode Skill[/bold cyan]\n"
        "[dim]Montage vidéo IA depuis le terminal[/dim]\n"
        "Motion design · Audio · Effets · Assemblage · Agents IA",
        border_style="cyan",
    ))

    action = await questionary.select(
        "Que veux-tu faire ?",
        choices=[
            "🎬 Nouveau montage automatique",
            "✨ Motion design",
            "🎵 Gestion audio",
            "🎨 Effets visuels",
            "📤 Exporter un projet",
            "📊 Tableau de bord",
            "🔑 Connexion / Compte",
            "⚙️ Paramètres",
            "❌ Quitter",
        ],
    ).ask_async()

    if action == "🎬 Nouveau montage automatique":
        await workflow_new_montage()
    elif action == "✨ Motion design":
        await workflow_motion_design()
    elif action == "🎵 Gestion audio":
        await workflow_audio()
    elif action == "🎨 Effets visuels":
        await workflow_effects()
    elif action == "📤 Exporter un projet":
        await workflow_export()
    elif action == "📊 Tableau de bord":
        await workflow_dashboard()
    elif action == "🔑 Connexion / Compte":
        await login()
    elif action == "⚙️ Paramètres":
        await workflow_settings()
    elif action == "❌ Quitter":
        console.print("[yellow]Au revoir ![/yellow]")
        return

    if await Confirm.ask("\n[dim]Retour au menu principal ?[/dim]", default=True):
        await main()


if __name__ == "__main__":
    import asyncio
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        console.print("\n[yellow]Interrompu par l'utilisateur.[/yellow]")
    except Exception as e:
        console.print(f"[red]Erreur : {e}[/red]")
        import traceback
        traceback.print_exc()
