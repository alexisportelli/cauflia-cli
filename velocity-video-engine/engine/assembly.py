from typing import Optional, List
from pathlib import Path
from .ffmpeg_utils import run_ffmpeg, get_media_info, build_filter_complex


class TimelineScene:
    def __init__(
        self,
        source: str,
        start: float = 0,
        duration: float = 5.0,
        track: int = 0,
        effects: Optional[list] = None,
        transitions: Optional[list] = None,
        position: Optional[dict] = None,
        volume: float = 1.0,
        speed: float = 1.0,
    ):
        self.source = source
        self.start = start
        self.duration = duration
        self.track = track
        self.effects = effects or []
        self.transitions = transitions or []
        self.position = position or {"x": 0, "y": 0, "width": 1, "height": 1}
        self.volume = volume
        self.speed = speed


class Timeline:
    def __init__(self, width: int = 1920, height: int = 1080, fps: int = 30):
        self.width = width
        self.height = height
        self.fps = fps
        self.scenes: list[TimelineScene] = []
        self.audio_tracks: list[dict] = []
        self.bg_music: Optional[str] = None

    def add_scene(self, scene: TimelineScene):
        self.scenes.append(scene)

    def add_audio_track(self, source: str, start: float = 0, volume: float = 1.0):
        self.audio_tracks.append({"source": source, "start": start, "volume": volume})

    def get_total_duration(self) -> float:
        if not self.scenes:
            return 0
        return max(s.start + s.duration for s in self.scenes)

    def render(self, output_path: str, progress_callback=None) -> str:
        temp_dir = Path(output_path).parent / f"_render_{Path(output_path).stem}"
        temp_dir.mkdir(parents=True, exist_ok=True)

        total = len(self.scenes)

        processed_clips = []
        for i, scene in enumerate(self.scenes):
            clip_out = str(temp_dir / f"clip_{i:04d}.mp4")

            args = [
                "-i", scene.source,
                "-ss", str(scene.start),
                "-t", str(scene.duration),
                "-vf", f"scale={self.width}:{self.height}:force_original_aspect_ratio=decrease,pad={self.width}:{self.height}:(ow-iw)/2:(oh-ih)/2",
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-y", clip_out,
            ]

            if scene.speed != 1.0:
                args = [
                    "-i", scene.source,
                    "-ss", str(scene.start),
                    "-t", str(scene.duration),
                    "-filter_complex",
                    f"[0:v]setpts={1/scene.speed}*PTS,scale={self.width}:{self.height}:force_original_aspect_ratio=decrease,pad={self.width}:{self.height}:(ow-iw)/2:(oh-ih)/2[v];"
                    f"[0:a]atempo={scene.speed}[a]",
                    "-map", "[v]",
                    "-map", "[a]",
                    "-c:v", "libx264",
                    "-pix_fmt", "yuv420p",
                    "-y", clip_out,
                ]

            run_ffmpeg(args)
            processed_clips.append(clip_out)
            if progress_callback:
                progress_callback((i + 1) / total * 50)

        concat_list = temp_dir / "concat.txt"
        concat_list.write_text(
            "\n".join(f"file '{p}'" for p in processed_clips)
        )

        concat_out = str(temp_dir / "concatenated.mp4")
        args = [
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_list),
            "-c", "copy",
            "-y", concat_out,
        ]
        run_ffmpeg(args)
        if progress_callback:
            progress_callback(60)

        if self.audio_tracks or self.bg_music:
            result = concat_out
            for j, at in enumerate(self.audio_tracks):
                mixed = str(temp_dir / f"audio_mixed_{j}.mp4")
                run_ffmpeg([
                    "-i", result,
                    "-i", at["source"],
                    "-filter_complex",
                    f"[0:a]volume=1.0[a0];[1:a]volume={at['volume']}[a1];"
                    f"[a0][a1]amix=inputs=2:duration=first[out]",
                    "-map", "0:v",
                    "-map", "[out]",
                    "-c:v", "copy",
                    "-y", mixed,
                ])
                result = mixed
            if progress_callback:
                progress_callback(80)
            run_ffmpeg(["-i", result, "-c", "copy", "-y", output_path])
        else:
            run_ffmpeg(["-i", concat_out, "-c", "copy", "-y", output_path])

        if progress_callback:
            progress_callback(100)

        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)

        return output_path


def assemble_video(
    scenes: list[dict],
    output_path: str,
    width: int = 1920,
    height: int = 1080,
    fps: int = 30,
    audio_tracks: Optional[list] = None,
    bg_music: Optional[str] = None,
    progress_callback=None,
) -> str:
    timeline = Timeline(width, height, fps)
    for s in scenes:
        timeline.add_scene(TimelineScene(
            source=s["source"],
            start=s.get("start", 0),
            duration=s.get("duration", 5),
            track=s.get("track", 0),
            effects=s.get("effects", []),
            transitions=s.get("transitions", []),
            position=s.get("position", {"x": 0, "y": 0, "width": 1, "height": 1}),
            volume=s.get("volume", 1.0),
            speed=s.get("speed", 1.0),
        ))
    if audio_tracks:
        for at in audio_tracks:
            timeline.add_audio_track(at["source"], at.get("start", 0), at.get("volume", 1.0))
    timeline.bg_music = bg_music
    return timeline.render(output_path, progress_callback)
