# data/

Single source of truth for all data files used across the TrafficVision AI stack. Member 3 owns this folder.

| Path | Format | Owner | Consumed by |
| --- | --- | --- | --- |
| `graph.json` | `{ nodes: [...], edges: [...] }` — see `TrafficVision AI — Team PRD` and `docs/CONTRACT_M3.md` §2 | M3 | M2 (`/api/map/graph`, routing, junctions) |
| `traffic.csv` | `segment_id,timestamp_utc,speed_kmph,free_flow_kmph,congestion_level,rain,incident,source` — §3 | M3 | M2 (traffic loader, predictions, signal queues) |
| `sample/` | Stand-ins used by every member before the real files land; same shapes, never shown as live | M3 | M1, M2 |
| `seed/` | Demo seed data (`users.json`, `incidents.json`) — Phase 4 | M3 | M2 (seed script) |

All files here are `SIMULATED` (or `HISTORICAL` for road geometry from OSM). Real files replace the samples at the phase merges; every file consumed from this folder must keep the exact contract shapes — no ad-hoc fields.

Timestamps are UTC with a `Z`. Congestion levels: `flowing` / `moderate` / `heavy` / `severe` / `no_data`.
