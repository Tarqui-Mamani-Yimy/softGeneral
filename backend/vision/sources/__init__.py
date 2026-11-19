"""Video input sources."""

from vision.sources.base import VideoSource
from vision.sources.file import FileSource

__all__ = ["FileSource", "VideoSource"]
