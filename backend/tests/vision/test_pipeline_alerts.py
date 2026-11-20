from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import numpy as np

from vision.detection.types import DetectionResult
from vision.evidence.recorder import EvidenceRecorder
from vision.pipeline import process_video
from vision.rules.config import RuleConfig
from vision.rules.engine import RulesEngine
from vision.rules.zones import Zone, ZoneMap


class Source:
    fps = 10.0
    frame_size = (100, 100)
    frame_count = 6

    def __init__(self):
        self.index = 0

    def read(self):
        if self.index == self.frame_count:
            return None
        self.index += 1
        return np.zeros((100, 100, 3), dtype=np.uint8)


class Writer:
    def write(self, frame):
        pass


class WalkingPerson:
    def analyze(self, frame):
        index = analyzer_state["index"]
        analyzer_state["index"] += 1
        box = (5, 20, 15, 70) if index < 3 else (40, 20, 60, 60)
        return [DetectionResult("person", 0.9, box, 11)]


analyzer_state = {"index": 0}


def test_pipeline_rules_create_one_intrusion_with_evidence(tmp_path: Path):
    analyzer_state["index"] = 0
    zones = ZoneMap([
        Zone("field", "field", ((0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8))),
        Zone("stands", "stands", ((0, 0), (0.2, 0), (0.2, 1), (0, 1))),
    ])
    engine = RulesEngine(zones, RuleConfig(intrusion_min_frames=3, fire_smoke_k=6, fire_smoke_n=10, weapon_k=3, weapon_n=5))
    evidence = EvidenceRecorder(tmp_path, uuid4(), 10, (100, 100), before_seconds=0.2, after_seconds=0.2)
    events = []

    process_video(Source(), Writer(), [WalkingPerson()], stride=1, rules_engine=engine, evidence=evidence, on_alert=lambda event, frame: (events.append(event), evidence.start_alert(event, uuid4(), frame)))
    evidence.flush()

    assert [event.alert_type for event in events] == ["intrusion"]
    assert list((tmp_path / "alerts").rglob("*.jpg"))
    assert list((tmp_path / "alerts").rglob("*.mp4"))
