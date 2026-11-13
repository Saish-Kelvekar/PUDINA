# backend/ — Member 2 (Express API, database, routing)

## Phase 0 (contracts) — what is here

| Path | What it is | Who uses it |
| --- | --- | --- |
| `docs/API.md` | Every endpoint: request, response, errors, Socket.IO events | Everyone (M1 most) |
| `docs/CONTRACT_M3.md` | File formats and ML service shapes agreed with Member 3 | M3, M2 |
| `mocks/*.json` | One example response per endpoint. **M1: copy these into `frontend/src/mocks/`** | M1 |
| `migrations/001_init.sql` | Database schema (all tables in the PRD) | M2 |
| `scripts/make_mocks.py` | Rebuilds `mocks/` from `data/sample/graph.json`, `data/sample/traffic.csv` and `ml-service/examples/` | M2 |

The Express code (`src/routes`, `src/controllers`, `src/services`, `src/repositories`) comes in Phase 1.

## Commands (from the repo root)

```bash
# rebuild the mocks after M3 changes a sample file
python backend/scripts/make_mocks.py

# create the tables (Phase 1, once PostgreSQL is installed)
psql "postgresql://postgres:<password>@localhost:5432/trafficvision" -f backend/migrations/001_init.sql
```
