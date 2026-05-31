from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, Literal
from pathlib import Path
import uuid
import json

from .auth import get_current_user
from engine.ffmpeg_utils import get_media_info, get_video_duration
from engine.compositor import trim_video, concat_videos, add_text_overlay, overlay_video
from engine.motion import add_transition, create_lower_third, zoom_pan, split_screen
from engine.audio import mix_audio, replace_audio, add_background_music, noise_reduction, normalize_audio
from engine.effects import apply_color_grade, apply_grayscale, apply_sepia, apply_vignette, apply_blur, apply_old_film
from engine.assembly import assemble_video
import config

router = APIRouter()


class TrimRequest(BaseModel):
    input_path: str
    start: float = 0
    duration: Optional[float] = None


class ConcatRequest(BaseModel):
    input_paths: list[str]


class TextOverlayRequest(BaseModel):
    input_path: str
    text: str
    font_size: int = 48
    font_color: str = "white"
    position: str = "center"


class TransitionRequest(BaseModel):
    input1: str
    input2: str
    transition_type: str = "fade"
    duration: float = 0.5


class AudioMixRequest(BaseModel):
    input_paths: list[str]
    volumes: Optional[list[float]] = None


class ColorGradeRequest(BaseModel):
    input_path: str
    brightness: float = 0.0
    contrast: float = 1.0
    saturation: float = 1.0
    gamma: float = 1.0


class AssembleRequest(BaseModel):
    scenes: list[dict]
    width: int = 1920
    height: int = 1080
    fps: int = 30
    audio_tracks: Optional[list[dict]] = None
    bg_music: Optional[str] = None


class MediaInfoResponse(BaseModel):
    duration: float
    width: int
    height: int
    fps: float
    codec: str
    size: int


# --- File Management ---

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    ext = Path(file.filename).suffix.lower()
    if ext not in config.ALLOWED_VIDEO_FORMATS | config.ALLOWED_AUDIO_FORMATS | config.ALLOWED_IMAGE_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {ext}")

    file_id = str(uuid.uuid4())
    out_path = config.UPLOAD_DIR / f"{file_id}{ext}"

    content = await file.read()
    out_path.write_bytes(content)

    info = get_media_info(str(out_path))

    return {
        "id": file_id,
        "filename": file.filename,
        "path": str(out_path),
        "size": len(content),
        "info": {
            "duration": float(info.get("format", {}).get("duration", 0)),
            "width": 0,
            "height": 0,
            "fps": 0,
        },
    }


@router.post("/info")
async def media_info(path: str = Form(...)):
    info = get_media_info(path)
    fmt = info.get("format", {})
    video_stream = next(
        (s for s in info.get("streams", []) if s["codec_type"] == "video"),
        None,
    )

    return {
        "duration": float(fmt.get("duration", 0)),
        "size": int(fmt.get("size", 0)),
        "width": int(video_stream.get("width", 0)) if video_stream else 0,
        "height": int(video_stream.get("height", 0)) if video_stream else 0,
        "fps": float(video_stream.get("r_frame_rate", "0/1").split("/")[0]) / float(video_stream.get("r_frame_rate", "1").split("/")[1]) if video_stream and "/" in video_stream.get("r_frame_rate", "0/1") else 0,
        "codec": fmt.get("format_name", ""),
    }


# --- Editing Operations ---

@router.post("/trim")
async def trim_endpoint(req: TrimRequest):
    out = str(config.OUTPUT_DIR / f"trim_{uuid.uuid4()}.mp4")
    result = trim_video(req.input_path, out, req.start, req.duration)
    return {"output_path": result}


@router.post("/concat")
async def concat_endpoint(req: ConcatRequest):
    out = str(config.OUTPUT_DIR / f"concat_{uuid.uuid4()}.mp4")
    result = concat_videos(req.input_paths, out)
    return {"output_path": result}


@router.post("/text-overlay")
async def text_overlay_endpoint(req: TextOverlayRequest):
    out = str(config.OUTPUT_DIR / f"text_{uuid.uuid4()}.mp4")
    result = add_text_overlay(req.input_path, out, req.text, req.font_size, req.font_color, req.position)
    return {"output_path": result}


@router.post("/transition")
async def transition_endpoint(req: TransitionRequest):
    out = str(config.OUTPUT_DIR / f"transition_{uuid.uuid4()}.mp4")
    result = add_transition(req.input1, req.input2, out, req.transition_type, req.duration)
    return {"output_path": result}


@router.post("/mix-audio")
async def mix_audio_endpoint(req: AudioMixRequest):
    out = str(config.OUTPUT_DIR / f"audio_{uuid.uuid4()}.mp3")
    result = mix_audio(req.input_paths, out, req.volumes)
    return {"output_path": result}


@router.post("/replace-audio")
async def replace_audio_endpoint(video_path: str = Form(...), audio_path: str = Form(...)):
    out = str(config.OUTPUT_DIR / f"replaced_{uuid.uuid4()}.mp4")
    result = replace_audio(video_path, audio_path, out)
    return {"output_path": result}


@router.post("/background-music")
async def bg_music_endpoint(video_path: str = Form(...), music_path: str = Form(...), volume: float = 0.3):
    out = str(config.OUTPUT_DIR / f"bgmusic_{uuid.uuid4()}.mp4")
    result = add_background_music(video_path, music_path, out, volume)
    return {"output_path": result}


@router.post("/color-grade")
async def color_grade_endpoint(req: ColorGradeRequest):
    out = str(config.OUTPUT_DIR / f"color_{uuid.uuid4()}.mp4")
    result = apply_color_grade(req.input_path, out, req.brightness, req.contrast, req.saturation, req.gamma)
    return {"output_path": result}


@router.post("/noise-reduction")
async def noise_reduction_endpoint(input_path: str = Form(...)):
    out = str(config.OUTPUT_DIR / f"denoised_{uuid.uuid4()}.mp3")
    result = noise_reduction(input_path, out)
    return {"output_path": result}


@router.post("/normalize-audio")
async def normalize_audio_endpoint(input_path: str = Form(...)):
    out = str(config.OUTPUT_DIR / f"normalized_{uuid.uuid4()}.mp3")
    result = normalize_audio(input_path, out)
    return {"output_path": result}


@router.post("/assemble")
async def assemble_endpoint(
    req: AssembleRequest,
    background_tasks: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    out = str(config.OUTPUT_DIR / f"final_{uuid.uuid4()}.mp4")
    result = assemble_video(
        scenes=req.scenes,
        output_path=out,
        width=req.width,
        height=req.height,
        fps=req.fps,
        audio_tracks=req.audio_tracks,
        bg_music=req.bg_music,
    )
    return {"output_path": result, "status": "completed"}


@router.get("/download/{filename}")
async def download_file(filename: str):
    file_path = config.OUTPUT_DIR / filename
    if not file_path.exists():
        file_path = config.UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(file_path))
