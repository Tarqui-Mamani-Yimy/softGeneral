from uuid import uuid4

import cv2
import numpy as np

from vision.detection.types import DetectionResult
from vision.rules.engine import AlertEvent
from vision.evidence.recorder import EvidenceRecorder


def test_evidence_ring_buffer_writes_before_after_clip_and_snapshot(tmp_path):
    recorder = EvidenceRecorder(tmp_path, uuid4(), fps=10, frame_size=(20, 20), before_seconds=1, after_seconds=1)
    event = AlertEvent("weapon", 10, 1.0, 0.9, (4, 4, 12, 12), 3, None, {})
    for index in range(10):
        recorder.record_frame(np.full((20, 20, 3), index, dtype=np.uint8), index / 10)
    snapshot, clip = recorder.start_alert(event, uuid4(), np.full((20, 20, 3), 10, dtype=np.uint8))
    for index in range(10, 16):
        recorder.record_frame(np.full((20, 20, 3), index, dtype=np.uint8), index / 10)
    recorder.flush()

    assert snapshot is not None and (tmp_path / snapshot).is_file()
    assert clip is not None and (tmp_path / clip).is_file()
    capture = cv2.VideoCapture(str(tmp_path / clip))
    assert int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) >= 10
    capture.release()


def test_evidence_flushes_clip_when_video_ends_before_after_window(tmp_path):
    recorder = EvidenceRecorder(tmp_path, uuid4(), fps=5, frame_size=(20, 20), before_seconds=1, after_seconds=3)
    event = AlertEvent("fire_smoke", 1, 0.2, 0.8, (1, 1, 10, 10), None, "field", {})
    frame = np.zeros((20, 20, 3), dtype=np.uint8)
    recorder.record_frame(frame, 0.0)
    recorder.start_alert(event, uuid4(), frame)
    recorder.record_frame(frame, 0.2)
    recorder.flush()

    assert list((tmp_path / "alerts").rglob("*.mp4"))
