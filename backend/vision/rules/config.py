from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import yaml

from vision.rules.zones import Zone, ZoneMap, ZONE_TYPES


@dataclass(frozen=True)
class RuleConfig:
    intrusion_min_frames: int = 3
    unknown_origin_alerts: bool = False
    fire_smoke_k: int = 6
    fire_smoke_n: int = 10
    fire_smoke_confidence: float = 0.5
    fire_ignore_zones: tuple[str, ...] = ("stands",)
    weapon_k: int = 3
    weapon_n: int = 5
    weapon_confidence: float = 0.6
    fight_k: int = 4
    fight_n: int = 6
    fight_confidence: float = 0.6
    cooldown_seconds: float = 30.0
    forget_after_seconds: float = 30.0


@dataclass(frozen=True)
class RulesConfig:
    rules: RuleConfig
    zones: ZoneMap


def load_rules_config(rules_path: str | Path, zones_path: str | Path) -> RulesConfig:
    with Path(rules_path).open(encoding="utf-8") as handle:
        raw_rules = yaml.safe_load(handle) or {}
    with Path(zones_path).open(encoding="utf-8") as handle:
        raw_zones = json.load(handle)
    values = {
        "intrusion_min_frames": raw_rules.get("intrusion", {}).get("min_frames", 3),
        "unknown_origin_alerts": raw_rules.get("intrusion", {}).get("unknown_origin_alerts", False),
        "fire_smoke_k": raw_rules.get("fire_smoke", {}).get("k", 6),
        "fire_smoke_n": raw_rules.get("fire_smoke", {}).get("n", 10),
        "fire_smoke_confidence": raw_rules.get("fire_smoke", {}).get("confidence", 0.5),
        "fire_ignore_zones": tuple(raw_rules.get("fire_smoke", {}).get("ignore_zones", ["stands"])),
        "weapon_k": raw_rules.get("weapon", {}).get("k", 3),
        "weapon_n": raw_rules.get("weapon", {}).get("n", 5),
        "weapon_confidence": raw_rules.get("weapon", {}).get("confidence", 0.6),
        "fight_k": raw_rules.get("fight", {}).get("k", 4),
        "fight_n": raw_rules.get("fight", {}).get("n", 6),
        "fight_confidence": raw_rules.get("fight", {}).get("confidence", 0.6),
        "cooldown_seconds": raw_rules.get("cooldown_seconds", 30),
        "forget_after_seconds": raw_rules.get("forget_after_seconds", 30),
    }
    config = RuleConfig(**values)
    if (
        config.intrusion_min_frames < 1
        or config.fire_smoke_k < 1
        or config.fire_smoke_n < config.fire_smoke_k
        or config.weapon_k < 1
        or config.weapon_n < config.weapon_k
        or config.fight_k < 1
        or config.fight_n < config.fight_k
    ):
        raise ValueError("Rule window values must be positive and k must not exceed n")
    zones = raw_zones.get("zones", raw_zones) if isinstance(raw_zones, dict) else raw_zones
    parsed = []
    for item in zones:
        zone_type = item.get("zone_type")
        if zone_type not in ZONE_TYPES:
            raise ValueError(f"Unknown zone type: {zone_type}")
        polygon = tuple(tuple(point) for point in item.get("polygon", []))
        parsed.append(Zone(item["name"], zone_type, polygon))
    return RulesConfig(config, ZoneMap(parsed))
