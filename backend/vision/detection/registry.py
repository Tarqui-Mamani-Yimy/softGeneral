from __future__ import annotations

import os
from pathlib import Path
from time import perf_counter

import numpy as np

from vision.detection.types import ClassificationResult, DetectionResult

MODEL_CONFIG = {
    "futbol": {"allowed_classes": {"ball", "player", "referee"}, "confidence": 0.25, "task": "detect"},
    "armas": {"allowed_classes": {"gun"}, "confidence": 0.25, "task": "detect"},
    "fuegoHumo": {"allowed_classes": {"fire", "smoke"}, "confidence": 0.25, "task": "detect"},
    "peleas": {"allowed_classes": {"fight", "normal"}, "confidence": 0.25, "task": "classify"},
}


def default_models_dir() -> Path:
    return Path(os.getenv("MODELS_DIR", Path(__file__).resolve().parents[3] / "modelos"))


class ModelAnalyzer:
    def __init__(self, model, config: dict, device: str):
        self.model = model
        self.config = config
        self.device = device
        self.names = model.names

    def predict(self, frame: np.ndarray) -> list[DetectionResult] | list[ClassificationResult]:
        results = self.model.predict(frame, device=self.device, verbose=False)
        result = results[0]
        if self.config["task"] == "classify":
            probabilities = result.probs
            index = int(probabilities.top1)
            label = self.names[index] if isinstance(self.names, list) else self.names[index]
            return [ClassificationResult(label=label, confidence=float(probabilities.top1conf))]
        detections = []
        for box in result.boxes:
            index = int(box.cls[0])
            label = self.names[index] if isinstance(self.names, list) else self.names[index]
            confidence = float(box.conf[0])
            if label in self.config["allowed_classes"] and confidence >= self.config["confidence"]:
                detections.append(DetectionResult(label, confidence, tuple(float(value) for value in box.xyxy[0])))
        return detections

    def analyze(self, frame: np.ndarray):
        return self.predict(frame)


class ModelRegistry:
    def __init__(self, models_dir: Path | None = None, device: str | None = None):
        self.models_dir = models_dir or default_models_dir()
        self.device = device or os.getenv("VISION_DEVICE", "cpu")

    def load(self, name: str) -> ModelAnalyzer:
        if name not in MODEL_CONFIG:
            raise ValueError(f"Unknown model: {name}")
        from ultralytics import YOLO

        config = MODEL_CONFIG[name]
        model = YOLO(str(self.models_dir / f"{name}.pt"))
        return ModelAnalyzer(model, config, self.device)


class TimedModel:
    def __init__(self, analyzer: ModelAnalyzer):
        self.analyzer = analyzer

    def run(self, frame: np.ndarray) -> tuple[object, float]:
        started = perf_counter()
        result = self.analyzer.predict(frame)
        return result, (perf_counter() - started) * 1000
