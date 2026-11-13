# How routing works

Owner: Member 2. All numbers live in `src/config/constants.js`. Code: `src/services/routingService.js` (A\*) and `src/services/routePlanner.js` (route types, stats, score).

## 1. The road graph

M3's `data/graph.json` is loaded into an **adjacency list**: for every junction, the roads you can drive out of it. A two-way road is added in both directions; a one-way road only from `from` to `to`.

## 2. A\* search

One search function is used everywhere (route planner, network impact diversion, emergency routing). It only needs a cost per road.

- Each junction gets a score: **cost so far + a guess of the cost left**. The junction with the lowest score is explored next (a priority queue, `src/utils/MinHeap.js`).
- The guess is the straight-line (haversine) distance. For time costs it is that distance at the **fastest speed on the map**, so it is **never too high**. That is what makes A\* return the same best path as Dijkstra, only faster. A test checks this for every pair of junctions and every route type.
- A cost of `Infinity` means the road can't be used (a verified closure).

## 3. Cost of one road

| Part | Value |
| --- | --- |
| Travel time | length ÷ current speed (roads without traffic data use free-flow speed) |
| Red light | **+20 s** at each signalised junction passed (not start or end) |
| Verified incident | +60 / 180 / 300 s for low / medium / high severity; a **closure** = road unusable |

Only **verified** incidents count. Pending reports never change routes.

## 4. The five route types

Same A\*, different cost per road. `ratio` = current speed ÷ free-flow speed (capped at 1).

| Type | Cost per road |
| --- | --- |
| `fastest` | travel time + red light + incident delay |
| `shortest` | length in metres |
| `least_congested` | travel time × (1 + 3 × (1 − ratio)) + red light + incident delay. A road at a quarter of its free speed costs 3.25× its travel time |
| `safest` (fewest incidents) | travel time + red light + 5 × incident delay + 120 s per incident |
| `eco` | metres × 0.07 L/km × (1 + 0.5 × (1 − ratio)) + incident delay ÷ 10 |

**Alternatives:** if a type finds a path another type already found, the roads on that path are made **1.5× more expensive** and A\* runs again (up to 10 times). If no different path exists, the card keeps its own best path and says `same_path_as: "r1"`.

## 5. Numbers on each route card

| Field | Formula |
| --- | --- |
| `distance_km` | sum of road lengths |
| `eta_min` | travel time on current speeds + 20 s per signal + incident delays |
| `congestion_pct` | length-weighted average of (1 − ratio) × 100 |
| `fuel_litres` | km × 0.07 × (1 + 0.5 × congestion share) |
| `reliability` | 100 − 10 per incident − 30 × (share of the length in heavy/severe traffic), never below 0 |

## 6. Multi-factor score and "why recommended"

1. For each factor (time, distance, congestion, incidents, fuel, reliability), the 5 routes are **min-max normalised** to 0–1, where 1 = best (lowest value, or highest for reliability). If all routes are equal on a factor, each gets 0.5.
2. Score = weighted sum ÷ total weight × 100. Default weights: time 0.35, distance 0.15, congestion 0.2, incidents 0.15, fuel 0.05, reliability 0.1. The Route Planner sliders change them.
3. Routes are sorted by score (ties: lower ETA first). The top one is recommended.
4. The explanation names the **two factors that added the most** to its score, e.g. "lowest travel time and light traffic".

## 7. Network impact (admin)

Breadth-first search finds roads up to 3 junctions away from the incident road. Speeds are multiplied by 0.5 on the incident road (lane blockage; closure = closed) and by 0.85 / 0.93 / 0.97 for roads 1 / 2 / 3 junctions away. The diversion is the fastest way between the two ends of the incident road without using it.

## 8. Emergency routing

- **Normal route:** `fastest` on current speeds, waiting at every red light.
- **Emergency route:** 15-minute **predicted** speeds (M3's model, or the baseline), never on a road with a verified incident (unless there is no other way), closures always avoided, **no red lights**.
- **Red-light wait** at each signal = M3's signal optimizer in emergency mode for the road the vehicle arrives on (`red_wait_saved_s`); 20 s each if the optimizer is not available.
- **Time saved** = normal ETA − emergency ETA.

## 9. Snapping a click to the map

A clicked source or destination goes to the nearest junction, and must be within 300 m of one. An incident report goes to the nearest **road** (checked against every bend of every road), within 200 m.
