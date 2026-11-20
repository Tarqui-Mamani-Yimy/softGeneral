from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np


@dataclass(frozen=True)
class FaceMatch:
    person_id: str
    full_name: str
    reason: str
    severity: str
    confidence: float
    bbox: tuple[float, float, float, float]  # (x1, y1, x2, y2)


def default_models_dir() -> Path:
    return Path(os.getenv("MODELS_DIR", Path(__file__).resolve().parents[3] / "modelos"))


class FaceRecognitionEngine:
    def __init__(
        self,
        models_dir: Path | None = None,
        score_threshold: float = 0.5,
        nms_threshold: float = 0.3,
        match_threshold: float = 0.40,
    ):
        self.models_dir = models_dir or default_models_dir()
        self.detector_path = self.models_dir / "face_detection_yunet_2023mar.onnx"
        self.recognizer_path = self.models_dir / "face_recognition_sface_2021dec.onnx"
        self.score_threshold = score_threshold
        self.nms_threshold = nms_threshold
        self.match_threshold = match_threshold

        self._detector: cv2.FaceDetectorYN | None = None
        self._recognizer: cv2.FaceRecognizerSF | None = None
        self._initialized = False

    def _ensure_initialized(self, width: int = 320, height: int = 320):
        if not self._initialized:
            if not self.detector_path.exists() or not self.recognizer_path.exists():
                raise FileNotFoundError(
                    f"Face models not found at {self.detector_path} or {self.recognizer_path}"
                )
            self._detector = cv2.FaceDetectorYN.create(
                str(self.detector_path),
                "",
                (width, height),
                self.score_threshold,
                self.nms_threshold,
                5000,
            )
            self._recognizer = cv2.FaceRecognizerSF.create(
                str(self.recognizer_path),
                "",
            )
            self._initialized = True
        else:
            assert self._detector is not None
            self._detector.setInputSize((width, height))

    def extract_encoding(self, image_data: bytes | np.ndarray) -> tuple[list[float], tuple[int, int, int, int]]:
        """Extract a 128-d face embedding from an input image (for registering banned persons)."""
        if isinstance(image_data, bytes):
            nparr = np.frombuffer(image_data, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("No se pudo decodificar la imagen proporcionada.")
        else:
            img = image_data

        h, w = img.shape[:2]
        self._ensure_initialized(w, h)
        assert self._detector is not None
        assert self._recognizer is not None

        _, faces = self._detector.detect(img)
        if faces is None or len(faces) == 0:
            raise ValueError("No se detectó ningún rostro claro en la imagen. Por favor sube una foto frontal.")

        # If multiple faces, select the one with highest detection confidence or largest area
        best_face = max(faces, key=lambda f: float(f[2]) * float(f[3]))
        x, y, fw, fh = int(best_face[0]), int(best_face[1]), int(best_face[2]), int(best_face[3])

        aligned = self._recognizer.alignCrop(img, best_face)
        feature = self._recognizer.feature(aligned)
        encoding = feature.flatten().astype(float).tolist()
        return encoding, (x, y, fw, fh)

    def find_matches(
        self,
        frame: np.ndarray,
        candidates: list[dict],
        match_threshold: float | None = None,
    ) -> list[FaceMatch]:
        """Detect faces in a video frame and compare them against candidates (banned persons)."""
        if not candidates:
            return []

        h, w = frame.shape[:2]
        self._ensure_initialized(w, h)
        assert self._detector is not None
        assert self._recognizer is not None

        _, faces = self._detector.detect(frame)
        if faces is None or len(faces) == 0:
            return []

        threshold = match_threshold if match_threshold is not None else self.match_threshold
        matches: list[FaceMatch] = []

        # Pre-cache candidate features as numpy arrays
        candidate_features = [
            (c, np.array(c["face_encoding"], dtype=np.float32).reshape(1, -1))
            for c in candidates
            if "face_encoding" in c and c["face_encoding"]
        ]

        for face in faces:
            conf = float(face[-1])
            if conf < self.score_threshold:
                continue

            x, y, fw, fh = float(face[0]), float(face[1]), float(face[2]), float(face[3])
            bbox = (max(0.0, x), max(0.0, y), min(float(w), x + fw), min(float(h), y + fh))

            aligned = self._recognizer.alignCrop(frame, face)
            feat = self._recognizer.feature(aligned)

            best_score = -1.0
            best_candidate = None

            for candidate, cand_feat in candidate_features:
                score = float(self._recognizer.match(feat, cand_feat, cv2.FaceRecognizerSF_FR_COSINE))
                if score > best_score:
                    best_score = score
                    best_candidate = candidate

            if best_candidate is not None and best_score >= threshold:
                matches.append(
                    FaceMatch(
                        person_id=str(best_candidate["id"]),
                        full_name=best_candidate.get("full_name", "Desconocido"),
                        reason=best_candidate.get("reason", "Persona Vetada"),
                        severity=best_candidate.get("severity", "high"),
                        confidence=best_score,
                        bbox=bbox,
                    )
                )

        return matches

