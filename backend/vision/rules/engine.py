from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from vision.detection.types import DetectionResult
from vision.rules.config import RuleConfig
from vision.rules.zones import Zone, ZoneMap


@dataclass(frozen=True)
class AlertEvent:
    alert_type: str
    frame_index: int
    timestamp_s: float
    confidence: float
    bbox: tuple[float, float, float, float]
    track_id: int | None
    zone: str | None
    details: dict


@dataclass
class TrackState:
    origin: Zone | None
    field_frames: int = 0
    last_seen: float = 0.0


def _bottom_center(box, frame_size):
    width, height = frame_size
    return (((box[0] + box[2]) / 2) / width, box[3] / height)


def _center(box, frame_size):
    width, height = frame_size
    return (((box[0] + box[2]) / 2) / width, ((box[1] + box[3]) / 2) / height)


def _overlaps(first, second):
    return max(0, min(first[2], second[2]) - max(first[0], second[0])) * max(0, min(first[3], second[3]) - max(first[1], second[1])) > 0


class RulesEngine:
    def __init__(self, zones: ZoneMap, config: RuleConfig | None = None):
        self.zones = zones
        self.config = config or RuleConfig()
        self.tracks: dict[int, TrackState] = {}
        self.fire_history = deque(maxlen=self.config.fire_smoke_n)
        self.weapon_history = deque(maxlen=self.config.weapon_n)
        self.fight_history = deque(maxlen=self.config.fight_n)
        self.cooldowns: dict[tuple[str, object], float] = {}

    def update(self, frame_index, timestamp_s, frame_size, person_tracks, detections, face_matches=None, classifications=None) -> list[AlertEvent]:
        events = []
        if face_matches:
            for match in face_matches:
                zone = self.zones.zone_of(_center(match.bbox, frame_size))
                key = ("face_match", match.person_id)
                if self._available_key(key, timestamp_s):
                    events.append(
                        AlertEvent(
                            "face_match",
                            frame_index,
                            timestamp_s,
                            match.confidence,
                            match.bbox,
                            None,
                            zone.name if zone else None,
                            {
                                "banned_person_id": match.person_id,
                                "name": match.full_name,
                                "reason": match.reason,
                                "severity": match.severity,
                            },
                        )
                    )
        seen = set()
        for person in person_tracks:
            if person.track_id is None:
                continue
            seen.add(person.track_id)
            zone = self.zones.zone_of(_bottom_center(person.box, frame_size))
            state = self.tracks.get(person.track_id)
            if state is None:
                state = TrackState(zone, 0, timestamp_s)
                self.tracks[person.track_id] = state
            state.last_seen = timestamp_s
            if zone and zone.zone_type == "field":
                state.field_frames += 1
            else:
                state.field_frames = 0
            origin_type = state.origin.zone_type if state.origin else None
            allowed = origin_type in {"stands", "restricted"} or (origin_type is None and self.config.unknown_origin_alerts)
            if allowed and state.field_frames >= self.config.intrusion_min_frames:
                if self._available_key(("intrusion", person.track_id), timestamp_s):
                    events.append(AlertEvent("intrusion", frame_index, timestamp_s, person.confidence, person.box, person.track_id, zone.name if zone else None, {"origin_zone": state.origin.name if state.origin else None}))
        for track_id in list(self.tracks):
            if timestamp_s - self.tracks[track_id].last_seen > self.config.forget_after_seconds and track_id not in seen:
                del self.tracks[track_id]

        fire = [d for d in detections if d.label in {"fire", "smoke"} and d.confidence >= self.config.fire_smoke_confidence]
        fire_zones = [(d, self.zones.zone_of(_center(d.box, frame_size))) for d in fire]
        fire_zones = [(d, zone) for d, zone in fire_zones if zone is None or zone.zone_type not in self.config.fire_ignore_zones]
        fire = [d for d, _ in fire_zones]
        self.fire_history.append(fire)
        if sum(bool(frame) for frame in self.fire_history) >= self.config.fire_smoke_k and fire:
            best = max(fire, key=lambda item: item.confidence)
            zone = self.zones.zone_of(_center(best.box, frame_size))
            if self._available_key(("fire_smoke", zone.name if zone else None), timestamp_s):
                events.append(AlertEvent("fire_smoke", frame_index, timestamp_s, best.confidence, best.box, None, zone.name if zone else None, {}))

        weapons = [d for d in detections if d.label == "gun" and d.confidence >= self.config.weapon_confidence]
        self.weapon_history.append(weapons)
        if sum(bool(frame) for frame in self.weapon_history) >= self.config.weapon_k and weapons:
            best = max(weapons, key=lambda item: item.confidence)
            person = next((track for track in person_tracks if _overlaps(best.box, track.box)), None)
            zone = self.zones.zone_of(_center(best.box, frame_size))
            track_id = person.track_id if person else None
            key = ("weapon", track_id if track_id is not None else (zone.name if zone else None))
            if self._available_key(key, timestamp_s):
                events.append(AlertEvent("weapon", frame_index, timestamp_s, best.confidence, best.box, track_id, zone.name if zone else None, {}))

        if classifications:
            fights = [c for c in classifications if c.label == "fight" and c.confidence >= self.config.fight_confidence]
            self.fight_history.append(fights)
            if sum(bool(frame) for frame in self.fight_history) >= self.config.fight_k and fights:
                best = max(fights, key=lambda item: item.confidence)
                if person_tracks:
                    min_x = max(0.0, min(p.box[0] for p in person_tracks))
                    min_y = max(0.0, min(p.box[1] for p in person_tracks))
                    max_x = min(float(frame_size[0]), max(p.box[2] for p in person_tracks))
                    max_y = min(float(frame_size[1]), max(p.box[3] for p in person_tracks))
                    bbox = (min_x, min_y, max_x, max_y)
                else:
                    bbox = (0.0, 0.0, float(frame_size[0]), float(frame_size[1]))
                zone = self.zones.zone_of(_center(bbox, frame_size))
                key = ("fight", zone.name if zone else None)
                if self._available_key(key, timestamp_s):
                    events.append(
                        AlertEvent(
                            "fight",
                            frame_index,
                            timestamp_s,
                            best.confidence,
                            bbox,
                            None,
                            zone.name if zone else None,
                            {"classification": "fight", "confidence": best.confidence},
                        )
                    )
        else:
            self.fight_history.append([])

        return events

    def _available_key(self, key, timestamp_s):
        previous = self.cooldowns.get(key)
        if previous is not None and timestamp_s - previous < self.config.cooldown_seconds:
            return False
        self.cooldowns[key] = timestamp_s
        return True
