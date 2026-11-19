import cv2
import numpy as np

from vision.annotation.draw import draw_detections
from vision.detection.types import DetectionResult


def test_draw_detections_changes_pixels_inside_box():
    frame = np.zeros((40, 40, 3), dtype=np.uint8)
    detection = DetectionResult(label="person", confidence=0.9, box=(5, 5, 25, 25), track_id=7)

    annotated = draw_detections(frame.copy(), [detection])

    assert not np.array_equal(frame[5:25, 5:25], annotated[5:25, 5:25])
