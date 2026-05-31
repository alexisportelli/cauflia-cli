from typing import Optional
from .ffmpeg_utils import run_ffmpeg


def apply_color_grade(
    input_path: str,
    output_path: str,
    brightness: float = 0.0,
    contrast: float = 1.0,
    saturation: float = 1.0,
    gamma: float = 1.0,
) -> str:
    filters = [
        f"eq=brightness={brightness}",
        f"contrast={contrast}",
        f"saturation={saturation}",
        f"gamma={gamma}",
    ]
    args = [
        "-i", input_path,
        "-vf", ":".join(filters),
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_grayscale(input_path: str, output_path: str) -> str:
    args = [
        "-i", input_path,
        "-vf", "colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3",
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_sepia(input_path: str, output_path: str) -> str:
    args = [
        "-i", input_path,
        "-vf", "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_vignette(
    input_path: str,
    output_path: str,
    strength: float = 0.3,
) -> str:
    args = [
        "-i", input_path,
        "-vf", f"vignette=PI*{strength}",
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_blur(
    input_path: str,
    output_path: str,
    amount: float = 5.0,
    gaussian: bool = True,
) -> str:
    filter_name = "gblur" if gaussian else "boxblur"
    args = [
        "-i", input_path,
        "-vf", f"{filter_name}=sigma={amount}",
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_glitch(
    input_path: str,
    output_path: str,
) -> str:
    args = [
        "-i", input_path,
        "-vf", "geq=r='X*Y/256':g='X*Y/128':b='X*Y/64'",
        "-c:v", "libx264",
        "-t", "2",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_pixelate(
    input_path: str,
    output_path: str,
    block_size: int = 16,
) -> str:
    args = [
        "-i", input_path,
        "-vf", f"avgblur=size={block_size}",
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_edge_detection(
    input_path: str,
    output_path: str,
) -> str:
    args = [
        "-i", input_path,
        "-vf", "edgedetect=low=0.1:high=0.3",
        "-c:v", "libx264",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_old_film(
    input_path: str,
    output_path: str,
) -> str:
    args = [
        "-i", input_path,
        "-vf", "curves=vintage,hue=s=0.4,noise=alls=8:allf=t+u",
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def apply_chroma_key(
    input_path: str,
    output_path: str,
    color: str = "green",
    similarity: float = 0.4,
    blend: float = 0.1,
) -> str:
    args = [
        "-i", input_path,
        "-vf", f"colorkey=0x{color_to_hex(color)}:{similarity}:{blend}",
        "-c:v", "libx264",
        "-c:a", "copy",
        "-y", output_path,
    ]
    run_ffmpeg(args)
    return output_path


def color_to_hex(color: str) -> str:
    colors = {
        "green": "00FF00",
        "blue": "0000FF",
        "red": "FF0000",
        "white": "FFFFFF",
        "black": "000000",
    }
    return colors.get(color.lower(), color)
