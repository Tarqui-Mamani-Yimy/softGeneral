import os

import cv2
import numpy as np
import pytest

from vision.detection.registry import ModelRegistry


@pytest.mark.models
def test_real_models_have_expected_classes_and_run():
    if os.getenv("RUN_MODEL_TESTS") != "1":
        pytest.skip("RUN_MODEL_TESTS is not set")
    expected = {
        "futbol": {"ball", "player", "referee"},
        "armas": {"gun"},
        "fuegoHumo": {"fire", "smoke"},
        "peleas": {"fight", "normal"},
    }
    frame = np.zeros((224, 224, 3), dtype=np.uint8)
    registry = ModelRegistry()
    for name, labels in expected.items():
        analyzer = registry.load(name)
        assert set(analyzer.names.values()) == labels
        analyzer.predict(frame)
