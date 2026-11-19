import shutil

import cv2
import numpy as np
import pytest

from vision.detection.types import DetectionResult
from vision.evidence.recorder import EvidenceRecorder
from vision.rules.engine import AlertEvent


@pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg and ffprobe are required")
def test_finished_alert_clip_is_h264(tmp_path, monkeypatch):
    monkeypatch.setenv("VIDEO_TRANSCODE_H264", "true")
    recorder = EvidenceRecorder(tmp_path, __import__("uuid").uuid4(), 5, (20, 20), before_seconds=0, after_seconds=0)
    frame = np.zeros((20, 20, 3), dtype=np.uint8)
    recorder.record_frame(frame, 0.0)
    event = AlertEvent("weapon", 0, 0.0, 0.9, (2, 2, 10, 10), 1, None, {})
    recorder.start_alert(event, __import__("uuid").uuid4(), frame)
    recorder.flush()
    clip = next((tmp_path / "alerts").rglob("*.mp4"))
    codec = __import__("subprocess").check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(clip)], text=True).strip()
    assert codec == "h264"
