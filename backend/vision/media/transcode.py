from __future__ import annotations

import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)


def _enabled() -> bool:
    return os.getenv("VIDEO_TRANSCODE_H264", "true").strip().lower() not in {"0", "false", "no", "off"}


def transcode_to_h264(path: str | Path, *, ffmpeg_binary: str | None = None, enabled: bool | None = None, timeout: float | None = None) -> bool:
    source = Path(path)
    if enabled is False or (enabled is None and not _enabled()):
        return False
    binary = ffmpeg_binary or os.getenv("FFMPEG_BINARY", "ffmpeg")
    temporary = source.with_name(f".{source.stem}.h264.tmp.mp4")
    command = [binary, "-y", "-loglevel", "error", "-i", str(source), "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", str(temporary)]
    try:
        subprocess.run(command, check=True, timeout=timeout or float(os.getenv("FFMPEG_TIMEOUT_SECONDS", "120")), shell=False)
        os.replace(temporary, source)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError, ValueError) as error:
        logger.warning("H.264 transcode unavailable for %s: %s; keeping original MP4", source, error)
        temporary.unlink(missing_ok=True)
        return False
    finally:
        temporary.unlink(missing_ok=True)
