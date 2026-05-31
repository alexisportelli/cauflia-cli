import os
from pathlib import Path

STORAGE_DIR = Path(os.environ.get("STORAGE_DIR", str(Path(__file__).parent / "storage")))
UPLOAD_DIR = STORAGE_DIR / "uploads"
OUTPUT_DIR = STORAGE_DIR / "outputs"
TEMP_DIR = STORAGE_DIR / "temp"

MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
ALLOWED_VIDEO_FORMATS = {".mp4", ".mov", ".webm", ".avi", ".mkv"}
ALLOWED_AUDIO_FORMATS = {".mp3", ".wav", ".aac", ".ogg", ".flac"}
ALLOWED_IMAGE_FORMATS = {".png", ".jpg", ".jpeg", ".webp"}

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
JWT_SECRET = os.environ.get("JWT_SECRET", "change-this-in-production")

for d in [UPLOAD_DIR, OUTPUT_DIR, TEMP_DIR]:
    d.mkdir(parents=True, exist_ok=True)
