from vision.detection.types import DetectionResult
from vision.rules.config import RuleConfig
from vision.rules.engine import RulesEngine
from vision.rules.zones import Zone, ZoneMap


FRAME = (100, 100)
ZONES = ZoneMap([
    Zone("field", "field", ((0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8))),
    Zone("stands", "stands", ((0, 0), (0.2, 0), (0.2, 1), (0, 1))),
    Zone("authorized", "authorized", ((0.8, 0), (1, 0), (1, 1), (0.8, 1))),
    Zone("restricted", "restricted", ((0.2, 0), (0.8, 0), (0.8, 0.2), (0.2, 0.2))),
])


def person(track_id, box):
    return DetectionResult("person", 0.9, box, track_id)


def detection(label, box=(40, 40, 60, 60), confidence=0.9):
    return DetectionResult(label, confidence, box)


def engine(**kwargs):
    return RulesEngine(ZONES, RuleConfig(**kwargs))


def test_intruder_from_stands_alerts_once_after_minimum_frames():
    rules = engine(intrusion_min_frames=3, unknown_origin_alerts=False, fire_smoke_k=6, fire_smoke_n=10, weapon_k=3, weapon_n=5)
    events = []
    for frame in range(1, 4):
        events.extend(rules.update(frame, float(frame), FRAME, [person(7, (5, 20, 15, 70))], []))
    assert not events
    for frame in range(4, 7):
        events.extend(rules.update(frame, float(frame), FRAME, [person(7, (40, 20, 60, 60))], []))
    assert [event.alert_type for event in events] == ["intrusion"]
    assert events[0].track_id == 7


def test_field_and_authorized_origins_do_not_alert_and_unknown_policy_applies():
    rules = engine(intrusion_min_frames=1, unknown_origin_alerts=False, fire_smoke_k=6, fire_smoke_n=10, weapon_k=3, weapon_n=5)
    assert not rules.update(1, 1.0, FRAME, [person(1, (40, 20, 60, 60))], [])
    assert not rules.update(1, 1.0, FRAME, [person(2, (80, 20, 90, 60))], [])
    assert not rules.update(1, 1.0, FRAME, [person(3, (40, 20, 60, 60))], [])
    unknown_rules = engine(intrusion_min_frames=1, unknown_origin_alerts=True, fire_smoke_k=6, fire_smoke_n=10, weapon_k=3, weapon_n=5)
    assert not unknown_rules.update(1, 1.0, FRAME, [person(4, (40, 20, 60, 95))], [])
    assert unknown_rules.update(2, 2.0, FRAME, [person(4, (40, 20, 60, 60))], [])[0].alert_type == "intrusion"


def test_fire_smoke_requires_six_of_last_ten_and_ignores_stands():
    rules = engine(intrusion_min_frames=3, fire_smoke_k=6, fire_smoke_n=10, fire_smoke_confidence=0.5, weapon_k=3, weapon_n=5, fire_ignore_zones=("stands",))
    events = []
    for frame in range(1, 11):
        events.extend(rules.update(frame, float(frame), FRAME, [], [detection("fire")] if frame <= 6 else []))
    assert [event.alert_type for event in events] == ["fire_smoke"]
    no_alert = engine(intrusion_min_frames=3, fire_smoke_k=6, fire_smoke_n=10, weapon_k=3, weapon_n=5)
    for frame in range(1, 11):
        assert not no_alert.update(frame, float(frame), FRAME, [], [detection("fire")] if frame <= 5 else [])
    ignored = engine(intrusion_min_frames=3, fire_smoke_k=1, fire_smoke_n=1, weapon_k=3, weapon_n=5, fire_ignore_zones=("stands",))
    assert not ignored.update(1, 1.0, FRAME, [], [detection("fire", (0, 40, 10, 60))])


def test_weapon_requires_k_of_n_and_associates_track():
    rules = engine(intrusion_min_frames=3, fire_smoke_k=6, fire_smoke_n=10, weapon_k=3, weapon_n=5, weapon_confidence=0.6)
    events = []
    for frame in range(1, 6):
        events.extend(rules.update(frame, float(frame), FRAME, [person(9, (35, 35, 65, 80))], [detection("gun", (45, 45, 55, 55))] if frame <= 3 else []))
    assert [event.alert_type for event in events] == ["weapon"]
    assert events[0].track_id == 9


def test_cooldown_suppresses_repeats_until_video_time_expires():
    rules = engine(intrusion_min_frames=1, cooldown_seconds=30, unknown_origin_alerts=True, fire_smoke_k=1, fire_smoke_n=1, weapon_k=1, weapon_n=1)
    assert rules.update(1, 1.0, FRAME, [], [detection("fire")])
    assert not rules.update(2, 2.0, FRAME, [], [detection("fire")])
    assert rules.update(3, 32.0, FRAME, [], [detection("fire")])


def test_overlapping_zones_use_restricted_then_field_priority():
    overlap = ZoneMap([
        Zone("field", "field", ((0, 0), (1, 0), (1, 1), (0, 1))),
        Zone("restricted_corner", "restricted", ((0, 0), (0.5, 0), (0.5, 0.5), (0, 0.5))),
    ])

    assert overlap.zone_of((0.25, 0.25)).name == "restricted_corner"
