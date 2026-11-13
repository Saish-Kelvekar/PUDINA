# PUDINA — TrafficVision AI

Hack Vally hackathon project (PS-01): live congestion map, route comparison, incident reporting
and verification, AI congestion prediction, adaptive signal simulation and emergency priority
routing, for a road network in south Bengaluru. All traffic is **simulated** and labelled as such.

| Module | Folder | Port | Tech |
| --- | --- | --- | --- |
| Website | `Frontend/` | 5173 | React + Vite + Tailwind + Leaflet |
| API | `backend/` | 5000 | Node/Express, PostgreSQL, Socket.IO |
| ML service | `ml-service/` | 8000 | FastAPI, scikit-learn |
| Data | `data/` | — | road graph + six weeks of simulated traffic |

```
Browser ──► Vite :5173 ──(/api, /socket.io proxy)──► Express API :5000 ──► PostgreSQL
                                                             └──────────► ML service :8000
```

## Run the demo (Windows)

**Prerequisites:** Node.js 18+, Python 3.10–3.13 (tick *Add to PATH*), PostgreSQL 14+ running locally
(you need the password of the `postgres` user), an internet connection (map tiles and fonts), and for
the first setup about 15 minutes and 4 GB of free RAM (the ML models are trained on the machine).

```powershell
git clone <repo> ; cd PUDINA
powershell -ExecutionPolicy Bypass -File .\setup.ps1   # once (asks for the postgres password)
powershell -ExecutionPolicy Bypass -File .\start.ps1   # every time
```

`setup.ps1` creates the `trafficvision` database, writes `backend\.env`, installs packages, loads the
road graph + traffic + demo data, and trains the ML models (first run only, several minutes; the
trained models are too large for git). It is safe to re-run; re-running resets the demo incidents
(use `-KeepIncidents` to keep them).

`start.ps1` opens three windows (ML service, API, website) and then opens http://localhost:5173.
Close those windows to stop.

### Demo logins (password `demo123`)

| Email | Role | Sees |
| --- | --- | --- |
| `admin@demo.test` | admin | everything, incl. Admin dashboard, Analytics, Emergency |
| `ems@demo.test` | emergency | Emergency routing + all commuter pages |
| `user@demo.test` | user | Map, Routes, Report, Forecast, Signals |

### Demo checklist

1. `http://localhost:5000/api/health` shows `"database":"connected"` and `"ml_service":{"status":"up"}`.
2. Log in as `admin@demo.test` → the Map shows coloured streets and incident markers.
3. Routes: the demo pair is pre-selected → **Compare routes** shows up to five options.
4. Signals: junction `J-n2666` → **Optimise & simulate**.
5. Emergency: **Compute priority route** → time saved.
6. Report an incident as `user@demo.test` (in a second browser) → it appears live on the admin's map and
   in the Admin dashboard; verify it there.
7. Admin → move the simulation clock ◀ ▶ to show traffic at other times of day.

### Troubleshooting

| Problem | Fix |
| --- | --- |
| "running scripts is disabled" | Use `powershell -ExecutionPolicy Bypass -File .\setup.ps1` |
| Setup can't connect to PostgreSQL | Start the service (admin PowerShell: `Start-Service postgresql-x64-<version>`) and check the password |
| Wrong postgres password saved | Delete `backend\.env` and run `setup.ps1` again |
| "Cannot reach the TrafficVision server" in the site | The API window is closed or crashed — check it, then re-run `start.ps1` |
| Forecast shows "Baseline fallback" / Signals says ML not running | The ML window is still loading models (~30-60 s) or was closed |
| Port already in use | Close the other program on 5000/5173/8000, or the old TrafficVision windows |

### Before pushing a new version

```powershell
git add -A          # includes new files: setup.ps1, start.ps1, Frontend/public/, Frontend/src/components/layout/ …
git status          # backend/.env, node_modules, venv and ml-service/models must NOT appear
git commit -m "…" ; git push
```

On the demo laptop after `git pull`: run `setup.ps1` again only if packages or the database changed
(it is quick once the models exist), then `start.ps1`.

## Manual setup (any OS)

```bash
# database
createdb -U postgres trafficvision
psql -U postgres -d trafficvision -f backend/migrations/001_init.sql
# backend
cd backend && cp .env.example .env   # set DATABASE_URL + JWT_SECRET
npm ci && node scripts/load-graph.js && node scripts/load-traffic.js && node scripts/seed-demo.js --reset
npm start
# ML service
cd ml-service && python -m venv venv && venv/Scripts/pip install pandas numpy scikit-learn joblib fastapi "uvicorn[standard]"
venv/Scripts/python scripts/train_model.py   # once
venv/Scripts/uvicorn app.main:app --port 8000
# website
cd Frontend && npm ci && npm run dev
```

More detail: `backend/README.md`, `backend/docs/API.md`, `ml-service/README.md`, `data/README.md`.
