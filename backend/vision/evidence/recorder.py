from __future__ import annotations

import logging
from collections import deque
from pathlib import Path
from uuid import UUID

import cv2
import numpy as np

from vision.rules.engine import AlertEvent
from vision.media.transcode import transcode_to_h264

logger = logging.getLogger(__name__)


class EvidenceRecorder:
    def __init__(self, storage_dir, job_id: UUID, fps: float, frame_size: tuple[int, int], before_seconds: float = 3.0, after_seconds: float = 3.0):
        self.storage_dir = Path(storage_dir)
        self.job_id = job_id
        self.fps = fps or 25.0
        self.frame_size = frame_size
        self.before_seconds = before_seconds
        self.after_seconds = after_seconds
        self.ring: deque[tuple[float, np.ndarray]] = deque(maxlen=max(1, int(self.fps * before_seconds) + 2))
        self.pending: list[dict] = []
        self.created_files: set[Path] = set()

    def record_frame(self, frame: np.ndarray, timestamp_s: float) -> None:
        self.ring.append((timestamp_s, frame.copy()))
        for item in list(self.pending):
            if item["writer"] is not None:
                try:
                    item["writer"].write(frame)
                except Exception:
                    logger.warning("Could not write alert clip frame", exc_info=True)
                    item["writer"].release()
                    item["writer"] = None
                    item["clip_path"].unlink(missing_ok=True)
            if timestamp_s >= item["end"]:
                self._close(item)
                self.pending.remove(item)

    def start_alert(self, event: AlertEvent, alert_id: UUID, frame: np.ndarray) -> tuple[str | None, str | None]:
        directory = self.storage_dir / "alerts" / str(self.job_id)
        directory.mkdir(parents=True, exist_ok=True)
        snapshot_path = directory / f"{alert_id}.jpg"
        clip_path = directory / f"{alert_id}.mp4"
        snapshot_relative = f"alerts/{self.job_id}/{alert_id}.jpg"
        clip_relative = f"alerts/{self.job_id}/{alert_id}.mp4"
        snapshot_ok = False
        try:
            highlighted = frame.copy()
            x1, y1, x2, y2 = (int(value) for value in event.bbox)
            cv2.rectangle(highlighted, (x1, y1), (x2, y2), (0, 0, 255), 3)
            snapshot_ok = bool(cv2.imwrite(str(snapshot_path), highlighted))
            if snapshot_ok:
                self.created_files.add(snapshot_path)
        except Exception:
            logger.warning("Could not write alert snapshot", exc_info=True)
        writer = None
        clip_ok = False
        try:
            writer = cv2.VideoWriter(str(clip_path), cv2.VideoWriter_fourcc(*"mp4v"), self.fps, self.frame_size)
            clip_ok = writer.isOpened()
            if clip_ok:
                for timestamp_s, buffered in self.ring:
                    if timestamp_s >= event.timestamp_s - self.before_seconds:
                        writer.write(buffered)
                self.created_files.add(clip_path)
            else:
                writer.release()
                clip_path.unlink(missing_ok=True)
                writer = None
        except Exception:
            logger.warning("Could not start alert clip", exc_info=True)
            if writer is not None:
                writer.release()
            clip_path.unlink(missing_ok=True)
            writer = None
        self.pending.append({"writer": writer, "clip_path": clip_path, "end": event.timestamp_s + self.after_seconds})
        return (snapshot_relative if snapshot_ok else None, clip_relative if clip_ok else None)

    def flush(self) -> None:
        for item in list(self.pending):
            self._close(item)
        self.pending.clear()

    def cleanup(self) -> None:
        self.flush()
        for path in self.created_files:
            path.unlink(missing_ok=True)
        self.created_files.clear()

    def _close(self, item: dict) -> None:
        if item["writer"] is not None:
            item["writer"].release()
            item["writer"] = None
            transcode_to_h264(item["clip_path"])
