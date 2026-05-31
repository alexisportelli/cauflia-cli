from pathlib import Path
from typing import Optional, Union
from .ffmpeg_utils import run_ffmpeg, build_filter_complex


def trim_video(
    input_path: str,
    output_path: str,
    start: float = 0,
    duration: Optional[float] = None,
    fast: bool = False,
) -> str:
    args = ["-i", input_path]
    if fast:
        args += ["-ss", str(start)]
        if duration is not None:
            args += ["-t", str(duration)]
        args += ["-c", "copy"]
    else:
        args += ["-ss", str(start)]
        if duration is not None:
            args += ["-t", str(duration)]
        args += ["-c:v", "libx264", "-c:a", "aac"]
    args += ["-y", output_path]
    run_ffmpeg(args)
    return output_path


def concat_videos(input_paths: list[str], output_path: str) -> str:
    if len(input_paths) == 1:
        args = ["-i", input_paths[0], "-c", "copy", "-y", output_path]
        run_ffmpeg(args)
        return output_path

    list_path = Path(output_path).parent / "_concat_list.txt"
    list_path.write_text("\n".join(f"file '{p}'" for p in input_paths))

    args = [
        "-f", "concat",
        "-safe", "0",
        "-i", str(list_path),
        "-c", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    list_path.unlink(missing_ok=True)
    return output_path


def overlay_video(
    background: str,
    overlay: str,
    output_path: str,
    position: Optional[dict] = None,
    scale: Optional[tuple] = None,
    trim: Optional[tuple] = None,
    crop: Optional[tuple] = None,
) -> str:
    pos = position or {"x": 0, "y": 0}
    filters = []

    overlay_input = overlay
    if crop:
        filters.append(
            f"[1:v]crop={crop[0]}:{crop[1]}:{crop[2]}:{crop[3]}[cropped]"
        )
        overlay_input = "[cropped]"
    if scale:
        filters.append(f"[1:v]scale={scale[0]}:{scale[1]}[scaled]")
        overlay_input = "[scaled]"

    filter_str = (
        f"[0:v]{overlay_input}"
        f"overlay={pos['x']}:{pos['y']}"
    )
    if filters:
        filter_str = build_filter_complex(filters) + ";" + filter_str

    args = [
        "-i", background,
        "-i", overlay,
        "-filter_complex", filter_str,
        "-c:v", "libx264",
        "-preset", "fast",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def add_text_overlay(
    input_path: str,
    output_path: str,
    text: str,
    font_size: int = 48,
    font_color: str = "white",
    position: str = "center",
    font_file: Optional[str] = None,
) -> str:
    x_map = {
        "center": "(w-text_w)/2",
        "left": "10",
        "right": "w - text_w - 10",
    }
    y_map = {
        "center": "(h-text_h)/2",
        "top": "10",
        "bottom": "h - text_h - 10",
    }

    pos_key = position.split("_")[0] if "_" in position else position
    x = x_map.get(pos_key, "(w-text_w)/2")
    y = y_map.get(pos_key.split("-")[-1] if "-" in pos_key else pos_key, "(h-text_h)/2")

    escaped_text = text.replace(":", "\\:").replace("'", "\\'")

    drawtext = (
        f"drawtext=text='{escaped_text}':"
        f"fontsize={font_size}:fontcolor={font_color}:"
        f"x={x}:y={y}"
    )
    if font_file:
        drawtext += f":fontfile={font_file}"

    args = [
        "-i", input_path,
        "-vf", drawtext,
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def resize_video(
    input_path: str,
    output_path: str,
    width: int,
    height: int,
    keep_aspect: bool = True,
) -> str:
    scale = f"scale={width}:{height}"
    if keep_aspect:
        scale += ":force_original_aspect_ratio=decrease"
        scale += f",pad={width}:{height}:(ow-iw)/2:(oh-ih)/2"

    args = [
        "-i", input_path,
        "-vf", scale,
        "-c:v", "libx264",
        "-c:a", "aac",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def change_speed(
    input_path: str,
    output_path: str,
    speed: float,
    audio_pitch: bool = False,
) -> str:
    video_filter = f"setpts={1/speed}*PTS"
    audio_filter = "atempo=1.0"
    if not audio_pitch:
        audio_filter = f"atempo={speed}"

    args = [
        "-i", input_path,
        "-filter_complex",
        f"[0:v]{video_filter}[v];[0:a]{audio_filter}[a]",
        "-map", "[v]",
        "-map", "[a]",
        "-c:v", "libx264",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def reverse_video(input_path: str, output_path: str) -> str:
    args = [
        "-i", input_path,
        "-vf", "reverse",
        "-af", "areverse",
        "-c:v", "libx264",
        "-preset", "fast",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def loop_video(
    input_path: str,
    output_path: str,
    loop_count: int = 1,
    total_duration: Optional[float] = None,
    fps: int = 30,
) -> str:
    args = [
        "-stream_loop", str(loop_count - 1),
        "-i", input_path,
        "-c", "copy",
    ]
    if total_duration is not None:
        args += ["-t", str(total_duration)]
    args += ["-y", output_path]
    run_ffmpeg(args)
    return output_path
