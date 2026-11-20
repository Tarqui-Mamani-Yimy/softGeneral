import cv2
import numpy as np

from vision.sources.file import FileSource


def test_file_source_reads_frames_and_metadata(tmp_path):
    path = tmp_path / "input.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 12.0, (16, 12))
    for value in (20, 40, 60):
        writer.write(np.full((12, 16, 3), value, dtype=np.uint8))
    writer.release()

    with FileSource(path) as source:
        assert source.fps == 12.0
        assert source.frame_size == (16, 12)
        assert source.frame_count == 3
        frames = []
        while (frame := source.read()) is not None:
            frames.append(frame)
        assert len(frames) == 3
        assert source.read() is None
