from typing import Optional, List
from pathlib import Path
from .ffmpeg_utils import run_ffmpeg


def extract_audio(
    input_path: str,
    output_path: str,
    format: str = "mp3",
    sample_rate: int = 44100,
) -> str:
    codec = "libmp3lame" if format == "mp3" else "aac"
    ext = "mp3" if format == "mp3" else "m4a"

    args = [
        "-i", input_path,
        "-vn",
        "-ar", str(sample_rate),
        "-acodec", codec,
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def mix_audio(
    input_paths: list[str],
    output_path: str,
    volumes: Optional[List[float]] = None,
    layout: str = "stereo",
) -> str:
    if not volumes:
        volumes = [1.0] * len(input_paths)

    input_args = []
    for p in input_paths:
        input_args += ["-i", p]

    filters = []
    for i, vol in enumerate(volumes):
        filters.append(f"[{i}:a]volume={vol}[a{i}]")

    mix_inputs = "".join(f"[a{i}]" for i in range(len(input_paths)))
    amix = f"{mix_inputs}amix=inputs={len(input_paths)}:duration=longest[aout]"
    filters.append(amix)

    args = input_args + [
        "-filter_complex", ";".join(filters),
        "-map", "[aout]",
        "-ac", "2" if layout == "stereo" else "1",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def replace_audio(
    video_path: str,
    audio_path: str,
    output_path: str,
    video_volume: float = 0.0,
    audio_volume: float = 1.0,
) -> str:
    args = [
        "-i", video_path,
        "-i", audio_path,
        "-filter_complex",
        f"[0:a]volume={video_volume}[v];[1:a]volume={audio_volume}[a];[v][a]amix=inputs=2:duration=first[out]",
        "-map", "0:v",
        "-map", "[out]",
        "-c:v", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def add_background_music(
    video_path: str,
    music_path: str,
    output_path: str,
    music_volume: float = 0.3,
    video_volume: float = 1.0,
    duck_volume: float = 0.15,
) -> str:
    args = [
        "-i", video_path,
        "-i", music_path,
        "-filter_complex",
        f"[0:a]volume={video_volume}[v];"
        f"[1:a]volume={music_volume},loudnorm=I=-16:LRA=11:TP=-1.5[m];"
        f"[v][m]amix=inputs=2:duration=first:weights=1 0.7[out]",
        "-map", "0:v",
        "-map", "[out]",
        "-c:v", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def noise_reduction(
    input_path: str,
    output_path: str,
    strength: float = 0.02,
) -> str:
    args = [
        "-i", input_path,
        "-af", f"afftdn=nr={strength}",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def normalize_audio(input_path: str, output_path: str) -> str:
    args = [
        "-i", input_path,
        "-af", "loudnorm=I=-16:LRA=11:TP=-1.5",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def fade_audio(
    input_path: str,
    output_path: str,
    fade_in: float = 0.0,
    fade_out: float = 0.0,
) -> str:
    filters = []
    if fade_in > 0:
        filters.append(f"afade=t=in:d={fade_in}")
    if fade_out > 0:
        filters.append(f"afade=t=out:st={fade_out}:d={fade_out}")

    if not filters:
        return input_path

    args = [
        "-i", input_path,
        "-af", ",".join(filters),
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def text_to_speech(
    text: str,
    output_path: str,
    voice: str = "default",
    language: str = "fr-FR",
) -> str:
    import json
    import tempfile

    ssml_path = Path(tempfile.mktemp(suffix=".ssml"))

    ssml_content = f"""<?xml version="1.0"?>
<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="{language}">
    <voice name="{voice}">{text}</voice>
</speak>"""
    ssml_path.write_text(ssml_content, encoding="utf-8")

    args = [
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=mono",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    ssml_path.unlink(missing_ok=True)
    return output_path
