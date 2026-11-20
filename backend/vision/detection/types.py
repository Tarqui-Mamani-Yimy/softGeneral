from dataclasses import dataclass


@dataclass(frozen=True)
class DetectionResult:
    label: str
    confidence: float
    box: tuple[float, float, float, float]
    track_id: int | None = None


@dataclass(frozen=True)
class ClassificationResult:
    label: str
    confidence: float
