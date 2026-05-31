import subprocess
import json
import os
from pathlib import Path
from typing import Optional


class FFmpegError(Exception):
    pass


def get_ffmpeg_path() -> str:
    return os.environ.get("FFMPEG_PATH", "ffmpeg")


def get_ffprobe_path() -> str:
    return os.environ.get("FFPROBE_PATH", "ffprobe")


def run_ffmpeg(args: list[str]) -> str:
    cmd = [get_ffmpeg_path()] + args
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise FFmpegError(f"FFmpeg error: {result.stderr}")
    return result.stdout


def get_media_info(filepath: str) -> dict:
    cmd = [
        get_ffprobe_path(),
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        filepath,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise FFmpegError(f"FFprobe error: {result.stderr}")
    return json.loads(result.stdout)


def get_video_duration(filepath: str) -> float:
    info = get_media_info(filepath)
    return float(info.get("format", {}).get("duration", 0))


def get_video_resolution(filepath: str) -> tuple[int, int]:
    info = get_media_info(filepath)
    for stream in info.get("streams", []):
        if stream["codec_type"] == "video":
            return int(stream["width"]), int(stream["height"])
    return (1920, 1080)


def get_video_fps(filepath: str) -> float:
    info = get_media_info(filepath)
    for stream in info.get("streams", []):
        if stream["codec_type"] == "video":
            r = stream.get("r_frame_rate", "30/1")
            num, den = r.split("/")
            return float(num) / float(den)
    return 30.0


def build_filter_complex(filters: list[str]) -> str:
    return ";".join(filters)
