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

## Commands (run inside backend/)

```bash
npm install                       # once
npm run dev                       # start API + Socket.IO on http://localhost:5000
npm test                          # unit tests (no database needed)
npm run test:db                   # check the database connection

# database, in this order (once, or after the data changes)
psql -U postgres -d trafficvision -f migrations/001_init.sql
psql -U postgres -d trafficvision -f migrations/002_route_history.sql   # safe to re-run
node scripts/load-graph.js        # roads from GRAPH_PATH
node scripts/load-traffic.js      # traffic from TRAFFIC_PATH
node scripts/seed-demo.js --reset # demo users + incidents (fresh demo)   = npm run seed
npm run demo:check                # plays the whole demo against the running server

python scripts/make_mocks.py      # rebuild mocks (from the repo root: python backend/scripts/make_mocks.py)
```

## .env

```
PORT=5000
DATABASE_URL=postgresql://postgres:<password>@localhost:5432/trafficvision
JWT_SECRET=<any long random text>
ML_SERVICE_URL=http://localhost:8000
SIM_START=2026-11-10T03:30:00Z
GRAPH_PATH=../data/graph.json
TRAFFIC_PATH=../data/traffic.csv
```

The API is described in `docs/API.md`; how routes are calculated in `docs/ROUTING.md`. If M3's ML service is not running, predictions use the baseline and emergency routing assumes 20 s per red light; only `/signals/simulate` needs it.
