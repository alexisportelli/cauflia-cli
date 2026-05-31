from typing import Optional
from .ffmpeg_utils import run_ffmpeg, build_filter_complex


def create_keyframe_animation(
    input_path: str,
    output_path: str,
    keyframes: list[dict],
    resolution: tuple[int, int] = (1920, 1080),
) -> str:
    w, h = resolution
    filters = []

    for i, kf in enumerate(keyframes):
        t = kf.get("time", 0)
        x = kf.get("x", 0)
        y = kf.get("y", 0)
        scale = kf.get("scale", 1.0)
        opacity = kf.get("opacity", 1.0)
        rotation = kf.get("rotation", 0)

        filters.append(
            f"between(t,{t},{t + 0.1})*{x}",
            f"between(t,{t},{t + 0.1})*{y}",
        )

    return input_path


def add_transition(
    input1: str,
    input2: str,
    output_path: str,
    transition_type: str = "fade",
    duration: float = 0.5,
) -> str:
    transition_map = {
        "fade": "fade",
        "dissolve": "fade",
        "slide_left": "slideleft",
        "slide_right": "slideright",
        "slide_up": "slideup",
        "slide_down": "slidedown",
        "wipe_left": "wipeleft",
        "wipe_right": "wiperight",
        "fade_black": "fadeblack",
        "fade_white": "fadewhite",
        "radial": "radial",
        "rect_crop": "rectcrop",
        "circle_crop": "circleopen",
        "pixelize": "pixelize",
    }

    xfade = transition_map.get(transition_type, "fade")
    offset = duration

    args = [
        "-i", input1,
        "-i", input2,
        "-filter_complex",
        f"[0:v][1:v]xfade=transition={xfade}:duration={duration}:offset={offset}[v]",
        "-map", "[v]",
        "-c:v", "libx264",
        "-preset", "fast",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def create_lower_third(
    input_path: str,
    output_path: str,
    name: str,
    title: str,
    font_size: int = 36,
    text_color: str = "white",
    bg_color: str = "black@0.6",
    duration: float = 5.0,
) -> str:
    w, h = (1920, 1080)
    box_h = 100
    box_y = h - box_h - 50

    filters = (
        f"drawbox=x=0:y={box_y}:w={w}:h={box_h}:color={bg_color}:t=fill,"
        f"drawtext=text='{name}':fontsize={font_size}:"
        f"fontcolor={text_color}:x=30:y={box_y + 15},"
        f"drawtext=text='{title}':fontsize={font_size - 8}:"
        f"fontcolor={text_color}:x=30:y={box_y + 55}"
    )

    args = [
        "-i", input_path,
        "-vf", filters,
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def zoom_pan(
    input_path: str,
    output_path: str,
    zoom_start: float = 1.0,
    zoom_end: float = 1.5,
    pan_x: float = 0,
    pan_y: float = 0,
    duration: float = 5.0,
    fps: int = 30,
) -> str:
    zoom_ratio = (zoom_end - zoom_start) / (duration * fps)
    pan_ratio_x = pan_x / (duration * fps)
    pan_ratio_y = pan_y / (duration * fps)

    filter_str = (
        f"zoompan=z='min(zoom+{zoom_ratio},{zoom_end})':"
        f"x='x+{pan_ratio_x}':"
        f"y='y+{pan_ratio_y}':"
        f"d={int(duration * fps)}:s={1920}x{1080}"
    )

    args = [
        "-i", input_path,
        "-vf", filter_str,
        "-c:v", "libx264",
        "-t", str(duration),
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def split_screen(
    inputs: list[str],
    output_path: str,
    layout: str = "2x2",
) -> str:
    layouts = {
        "1x2": {"cols": 2, "rows": 1},
        "2x1": {"cols": 1, "rows": 2},
        "2x2": {"cols": 2, "rows": 2},
        "3x3": {"cols": 3, "rows": 3},
    }
    l = layouts.get(layout, layouts["2x2"])

    pad_w = 1920
    pad_h = 1080
    cell_w = pad_w // l["cols"]
    cell_h = pad_h // l["rows"]

    input_args = []
    for inp in inputs:
        input_args += ["-i", inp]

    overlay_str = ""
    for i in range(min(len(inputs), l["cols"] * l["rows"])):
        col = i % l["cols"]
        row = i // l["cols"]
        x = col * cell_w
        y = row * cell_h
        scaled = f"[{i}:v]scale={cell_w}:{cell_h}:force_original_aspect_ratio=decrease,pad={cell_w}:{cell_h}:(ow-iw)/2:(oh-ih)/2[v{i}]"
        overlay_str += f"{scaled};"

    overlay_filter = ""
    base = f"[v0]"
    for i in range(1, min(len(inputs), l["cols"] * l["rows"])):
        col = i % l["cols"]
        row = i // l["cols"]
        x = col * cell_w
        y = row * cell_h
        overlay_filter += f"[{base[:-1]}]overlay={x}:{y}[ov{i}]"
        base = f"[ov{i}]"

    full_filter = overlay_str + overlay_filter

    args = input_args + [
        "-filter_complex", full_filter,
        "-map", f"[ov{min(len(inputs), l['cols'] * l['rows']) - 1}]",
        "-c:v", "libx264",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def add_ken_burns(
    input_path: str,
    output_path: str,
    duration: float,
    scale_start: float = 1.0,
    scale_end: float = 1.3,
    fps: int = 30,
) -> str:
    return zoom_pan(
        input_path, output_path,
        zoom_start=scale_start,
        zoom_end=scale_end,
        duration=duration,
        fps=fps,
    )
