from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

ZONE_TYPES = {"field", "authorized", "stands", "restricted"}
ZONE_PRIORITY = ("restricted", "field", "authorized", "stands")


@dataclass(frozen=True)
class Zone:
    name: str
    zone_type: str
    polygon: tuple[tuple[float, float], ...]

    def __post_init__(self):
        if self.zone_type not in ZONE_TYPES:
            raise ValueError(f"Unknown zone type: {self.zone_type}")
        if len(self.polygon) < 3:
            raise ValueError(f"Zone {self.name} polygon must have at least 3 points")
        for x, y in self.polygon:
            if not (0 <= x <= 1 and 0 <= y <= 1):
                raise ValueError(f"Zone {self.name} coordinates must be between 0 and 1")


def point_in_polygon(point: tuple[float, float], polygon: Iterable[tuple[float, float]]) -> bool:
    x, y = point
    points = list(polygon)
    inside = False
    for index, (x1, y1) in enumerate(points):
        x2, y2 = points[index - 1]
        if (y1 > y) != (y2 > y):
            crossing_x = (x2 - x1) * (y - y1) / (y2 - y1) + x1
            if x < crossing_x:
                inside = not inside
    return inside


class ZoneMap:
    def __init__(self, zones: Iterable[Zone]):
        self.zones = tuple(zones)

    def zone_of(self, point: tuple[float, float]) -> Zone | None:
        for zone_type in ZONE_PRIORITY:
            for zone in self.zones:
                if zone.zone_type == zone_type and point_in_polygon(point, zone.polygon):
                    return zone
        return None
