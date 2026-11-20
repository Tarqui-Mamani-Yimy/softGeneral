import json

import pytest

from vision.rules.config import load_rules_config


def write_config(tmp_path, rules=None, zones=None):
    rules_path = tmp_path / "rules.yaml"
    zones_path = tmp_path / "zones.json"
    rules_path.write_text(json.dumps(rules or {}))
    zones_path.write_text(json.dumps(zones or {"zones": []}))
    return rules_path, zones_path


def test_config_rejects_short_polygon(tmp_path):
    rules, zones = write_config(tmp_path, zones={"zones": [{"name": "field", "zone_type": "field", "polygon": [[0, 0], [1, 0]]}]})

    with pytest.raises(ValueError, match="at least 3 points"):
        load_rules_config(rules, zones)


def test_config_rejects_out_of_range_coordinate(tmp_path):
    rules, zones = write_config(tmp_path, zones={"zones": [{"name": "field", "zone_type": "field", "polygon": [[0, 0], [1, 0], [1.1, 1]]}]})

    with pytest.raises(ValueError, match="between 0 and 1"):
        load_rules_config(rules, zones)


def test_config_rejects_unknown_zone_type(tmp_path):
    rules, zones = write_config(tmp_path, zones={"zones": [{"name": "bad", "zone_type": "unknown", "polygon": [[0, 0], [1, 0], [1, 1]]}]})

    with pytest.raises(ValueError, match="Unknown zone type"):
        load_rules_config(rules, zones)
