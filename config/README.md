# Vision rules configuration

`rules.yaml` contains confidence thresholds, confirmation windows, cooldowns,
and the unknown-origin policy. `zones/<scene>.json` contains named polygons.

Polygon coordinates are normalized image coordinates: `x` and `y` are decimal
values from 0 to 1, with `(0, 0)` at the top-left and `(1, 1)` at the bottom-right.
The engine uses the bottom-center of a person's box as their position. When
zones overlap, priority is deterministic: restricted, field, authorized, then
stands. This keeps a restricted overlap from being treated as an ordinary stand.

The worker reads these files through `WORKER_RULES_FILE` and
`WORKER_ZONES_FILE`. If the zones file is unavailable, weapon and fire/smoke
rules still run without zone filtering; intrusion rules remain inactive.

## Demo zones

`zones/demo.json` is used by browser-demo cameras (code starting with `demo_`)
through `DEMO_ZONES_FILE` (default `../config/zones/demo.json`); every other
camera keeps `WORKER_ZONES_FILE`. It splits the frame into three full-height
vertical strips with no authorized zone: `demo_stands_left` (x 0 to 0.25),
`demo_field` (x 0.25 to 0.75) and `demo_stands_right` (x 0.75 to 1). A person
who enters the frame from a side and stays in the center raises an `intrusion`.
