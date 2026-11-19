import cv2
import numpy as np

from vision.annotation.writer import VideoWriter
from vision.pipeline import process_video
from vision.sources.file import FileSource
from vision.detection.types import DetectionResult


class FakeAnalyzer:
    def analyze(self, frame):
        return [DetectionResult(label="person", confidence=0.8, box=(1, 1, 8, 8))]


def test_pipeline_respects_stride_reports_progress_and_writes_output(tmp_path):
    input_path = tmp_path / "input.mp4"
    output_path = tmp_path / "output.mp4"
    input_writer = cv2.VideoWriter(str(input_path), cv2.VideoWriter_fourcc(*"mp4v"), 10.0, (20, 20))
    for _ in range(5):
        input_writer.write(np.zeros((20, 20, 3), dtype=np.uint8))
    input_writer.release()
    progress = []

    with FileSource(input_path) as source, VideoWriter(output_path, fps=source.fps, frame_size=source.frame_size) as writer:
        summary = process_video(source, writer, [FakeAnalyzer()], stride=2, on_progress=progress.append)

    assert summary.frames_read == 5
    assert summary.frames_analyzed == 3
    assert summary.detections_per_label == {"person": 3}
    assert summary.processing_fps > 0
    assert progress[0] == 0
    assert progress[-1] == 100
    assert output_path.exists()
    capture = cv2.VideoCapture(str(output_path))
    assert int(capture.get(cv2.CAP_PROP_FRAME_COUNT)) == 5
    capture.release()
