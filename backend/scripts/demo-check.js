// Plays the whole demo story against a RUNNING backend and checks every step.
//   1. npm run dev                       (in another terminal)
//   2. node scripts/seed-demo.js --reset (fresh demo data)
//   3. node scripts/demo-check.js
// It creates a few incidents and a test user; run seed-demo.js --reset again afterwards for a clean demo.
require("dotenv").config({ quiet: true });

const BASE = process.env.DEMO_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;
const API = `${BASE}/api`;
const PASSWORD = "demo123";
let passed = 0, failed = 0, warned = 0;

const ok = (msg) => { passed++; console.log(`  ✅ ${msg}`); };
const bad = (msg) => { failed++; console.log(`  ❌ ${msg}`); };
const warn = (msg) => { warned++; console.log(`  ⚠️  ${msg}`); };
const check = (cond, good, fail) => (cond ? ok(good) : bad(fail || good));
const step = (title) => console.log(`\n${title}`);

async function call(method, path, { token, body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ...json };
}
const login = async (email) => (await call("POST", "/auth/login", { body: { email, password: PASSWORD } })).data?.token;
// A point in the middle of a road piece (never on a junction, where two roads meet)
const midpoint = (edge) => {
  const k = Math.max(0, Math.floor((edge.coords.length - 1) / 2));
  const a = edge.coords[k], b = edge.coords[k + 1] || a;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
};

(async () => {
  console.log(`Demo check against ${BASE}`);

  // ---------- 0. server, database, ML service ----------
  step("0. Server is up");
  let health;
  try { health = await call("GET", "/health"); } catch {
    console.log(`  ❌ Cannot reach ${BASE}. Start it with: npm run dev`); process.exit(1);
  }
  check(health.data?.database === "connected", "database connected", "database NOT connected");
  const mlUp = health.data?.ml_service?.status === "up";
  mlUp ? ok(`ML service up (${health.data.ml_service.model_version})`)
       : warn(`ML service down (${health.data?.ml_service?.reason}). Predictions use the baseline; signal page will show an error`);

  const user = await login("user@demo.test"), admin = await login("admin@demo.test"), ems = await login("ems@demo.test");
  if (!user || !admin || !ems) { bad("demo users missing. Run: node scripts/seed-demo.js --reset"); return finish(); }
  ok("demo users can log in (user, admin, emergency)");

  // ---------- 1. map ----------
  step("1. Map: roads coloured by congestion, SIMULATED badge, time");
  const graph = (await call("GET", "/map/graph")).data;
  check(graph?.edge_count > 0, `road graph: ${graph?.node_count} junctions, ${graph?.edge_count} roads`);
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  const flow = (await call("GET", "/traffic/flow")).data;
  const withData = flow.segments.filter((s) => s.congestion_level !== "no_data");
  check(flow.source === "SIMULATED" && flow.sim_time_utc, `traffic is SIMULATED at ${flow.sim_time_utc}`);
  check(withData.length > 0, `${withData.length} roads have speeds`, "no road has traffic data. Run load-traffic.js");
  if (graph.node_count < 100) warn("this looks like the SAMPLE graph. Set GRAPH_PATH=../data/graph.json in .env");
  const incidents = (await call("GET", "/incidents")).data;
  check(incidents?.count > 0, `${incidents?.count} incidents on the map`, "no incidents. Run seed-demo.js --reset");

  // ---------- 2. route planner ----------
  step("2. Route planner: 5 cards, recommended explains why, sliders change ranking");
  const FROM = { node_id: "n2509" }, TO = { node_id: "n2563" };
  let cmp = await call("POST", "/routes/compare", { token: user, body: { source: FROM, destination: TO } });
  if (!cmp.success) { bad(`compare failed: ${cmp.error?.message}`); return finish(); }
  const routes = cmp.data.routes;
  check(routes.length === 5, "5 route cards", `${routes.length} route cards`);
  check(routes.filter((r) => r.recommended).length === 1 && /^Recommended/.test(routes[0].explanation),
    `recommended: ${routes[0].label}, ${routes[0].eta_min} min ("${routes[0].explanation}")`);
  const distOnly = await call("POST", "/routes/compare", { token: user,
    body: { source: FROM, destination: TO, weights: { time: 0, distance: 1, congestion: 0, incidents: 0, fuel: 0, reliability: 0 } } });
  const shortestKm = Math.min(...distOnly.data.routes.map((r) => r.distance_km));
  check(distOnly.data.routes[0].distance_km === shortestKm, "distance-only weights put the shortest route first");

  // ---------- 2b. search history ----------
  step("2b. Search history: saved searches, \"use this route\", private per user");
  const firstId = cmp.data.comparison_id;
  const pick = routes.find((r) => !r.recommended) || routes[0];
  const chose = await call("POST", `/routes/history/${firstId}/choose`, { token: user, body: { route_id: pick.route_id } });
  check(chose.data?.item.chosen?.route_id === pick.route_id,
    `chose "${pick.label}" (followed recommendation: ${chose.data?.item.chosen?.followed_recommendation})`, `choose failed: ${chose.error?.message}`);
  const hist = (await call("GET", "/routes/history?limit=5", { token: user })).data;
  check(hist?.items[0]?.id === distOnly.data.comparison_id && hist.items.some((i) => i.id === firstId && i.chosen),
    `history lists ${hist?.total} search(es), newest first, with the chosen route`);
  const saved = (await call("GET", `/routes/history/${firstId}`, { token: user })).data;
  check(saved?.saved && saved.routes.length === routes.length && saved.chosen_route_id === pick.route_id,
    "a saved search opens again with all its routes and the choice");
  check((await call("GET", `/routes/history/${firstId}`, { token: admin })).status === 404, "another user cannot see this search");
  check((await call("DELETE", `/routes/history/${distOnly.data.comparison_id}`, { token: user })).data?.deleted === 1, "a search can be deleted from history");

  // ---------- 3. report the same accident twice ----------
  step("3. Report an accident on the recommended route, then again from a second account");
  const rec = routes[0];
  const target = edgeById.get(rec.edge_ids[Math.floor(rec.edge_ids.length / 2)]);
  const [lat, lng] = midpoint(target);
  const email2 = `second.${Date.now()}@demo.test`;
  await call("POST", "/auth/register", { body: { name: "Second Reporter", email: email2, password: PASSWORD } });
  const user2 = await login(email2);
  const live = await listenForEvents();
  const r1 = await call("POST", "/incidents", { token: user, body: { category: "accident", reported_severity: "medium", lanes_blocked: 1,
    description: "Car and bike collision, one lane blocked", lat, lng } });
  check(r1.success && r1.data.incident.segment_id === target.id,
    `report #${r1.data?.incident.id} on ${target.name || target.id}, estimated ${r1.data?.incident.estimated_severity?.level}`,
    r1.success ? `report landed on ${r1.data.incident.segment_id}, expected ${target.id}` : `report failed: ${r1.error?.message}`);
  const r2 = await call("POST", "/incidents", { token: user2, body: { category: "accident", reported_severity: "high",
    description: "Crash between car and bike, traffic slow", lat: lat + 0.0001, lng: lng + 0.0001 } });
  check(r2.success && r2.data.possible_duplicates >= 1, `second report #${r2.data?.incident.id} flagged as a possible duplicate`,
    "second report was NOT flagged as a duplicate");
  const id1 = r1.data.incident.id, id2 = r2.data.incident.id;

  // ---------- 4. admin ----------
  step("4. Admin: duplicates with score, merge, verify, network impact");
  const dups = await call("GET", `/incidents/${id2}/duplicates`, { token: admin });
  const pair = dups.data?.candidates.find((c) => c.incident.id === id1);
  check(pair && pair.score >= dups.data.threshold, `duplicate pair score ${pair?.score} (threshold ${dups.data?.threshold})`);
  check((await call("POST", `/incidents/${id2}/merge`, { token: admin, body: { into_id: id1 } })).data?.incident.status === "merged", "merged second report into the first");
  check((await call("POST", `/incidents/${id1}/verify`, { token: admin })).data?.incident.status === "verified", "verified the accident");
  const impact = (await call("POST", `/incidents/${id1}/impact`, { token: admin, body: {} })).data;
  check(impact?.affected_segments.length > 1 && impact.source === "SIMULATED",
    `network impact: ${impact?.affected_segments.length} roads affected, ${impact?.total_extra_delay_min} min extra delay`);
  impact?.diversion_route ? ok(`diversion: ${impact.diversion_route.distance_km} km, ${impact.detour_minutes} min detour`)
                          : warn("no diversion (incident is on a dead-end road)");
  const overview = (await call("GET", "/admin/overview", { token: admin })).data;
  check(overview?.counts.incidents_total > 0, `admin overview: ${overview?.counts.pending} pending, ${overview?.counts.verified} verified, ${overview?.counts.duplicate_candidates} duplicate candidates`);

  // ---------- 5. route avoids it ----------
  step("5. Same search now avoids the accident");
  cmp = await call("POST", "/routes/compare", { token: user, body: { source: FROM, destination: TO } });
  const after = cmp.data.routes[0];
  check(!after.edge_ids.includes(target.id), `recommended route no longer uses ${target.name || target.id} (${after.eta_min} min)`,
    `recommended route still goes through the accident`);
  const through = cmp.data.routes.find((r) => r.edge_ids.includes(target.id));
  if (through) check(through.incident_ids.includes(id1), `the route through it shows incident #${id1} and is ranked #${through.rank}`);

  // ---------- 6. predictions ----------
  step("6. Predicted congestion layer and Prediction page");
  for (const h of [15, 30]) {
    const p = (await call("GET", `/predictions?horizon=${h}`)).data;
    check(p?.predictions.length > 0, `${h}-min predictions for ${p?.predictions.length} roads (${p?.model_version})`);
    if (mlUp && p?.model_version === "baseline") warn(`ML is up but ${h}-min used the baseline: ${p.fallback_reason}`);
  }
  const m = (await call("GET", "/predictions/metrics")).data;
  m?.available ? ok(`model MAE ${m.horizons["15"].mae_model_kmph} km/h vs baseline ${m.horizons["15"].mae_baseline_kmph} (15 min)`)
               : warn("metrics unavailable (ML service down): Prediction page shows '-'");
  const seg = withData[0]?.segment_id;
  if (m?.available && seg) {
    const s = (await call("GET", `/predictions/metrics?segment_id=${seg}&horizon=15`)).data;
    check(s?.series?.points.length > 0, `actual vs predicted chart: ${s?.series?.points.length} points for ${seg}`);
  }

  // ---------- 7. signals ----------
  step("7. Signal page: current vs optimized timings");
  const junctions = (await call("GET", "/signals/junctions", { token: user })).data?.junctions || [];
  check(junctions.length > 0, `${junctions.length} signalised junctions`);
  const jid = junctions.find((j) => j.junction_id === "J-n2666") ? "J-n2666" : junctions[0]?.junction_id;
  const sim = await call("POST", "/signals/simulate", { token: user, body: { junction_id: jid } });
  if (mlUp) check(sim.success, `${jid}: average wait ${sim.data?.current.avg_wait_s} s -> ${sim.data?.optimized.avg_wait_s} s, ${sim.data?.reasons.length} reasons`,
    `simulate failed: ${sim.error?.message}`);
  else check(sim.status === 503 && sim.error?.code === "ML_UNAVAILABLE", "ML down: signal simulate returns a clear ML_UNAVAILABLE error");

  // ---------- 8. emergency ----------
  step("8. Emergency: normal vs emergency ETA, time saved, marked as simulation");
  const em = await call("POST", "/emergency/routes", { token: ems,
    body: { vehicle_type: "ambulance", source: { node_id: "n2509" }, destination: { node_id: "n2563" } } });
  check(em.success && em.data.simulation === true,
    `normal ${em.data?.normal_route.eta_min} min, emergency ${em.data?.emergency_route.eta_min} min, saved ${em.data?.time_saved_min} min (${em.data?.signal_wait_source})`,
    `emergency route failed: ${em.error?.message}`);
  check(em.data?.time_saved_min >= 0, "time saved is not negative");
  check((await call("POST", "/emergency/routes", { token: user, body: { vehicle_type: "ambulance", source: FROM, destination: TO } })).status === 403,
    "a normal user cannot use emergency routing");

  // ---------- 9. analytics + live alerts ----------
  step("9. Analytics page and live alerts");
  const an = (await call("GET", "/admin/analytics", { token: admin })).data;
  check(an?.congestion_by_hour.length === 24, `congestion by hour: 24 hours (busiest share ${Math.max(...(an?.congestion_by_hour || [{}]).map((h) => h.heavy_or_severe_share || 0))})`);
  check(an?.incidents_by_type.length > 0 && an?.emergency_time_saved.sessions > 0, "incidents by type and emergency time saved are filled");
  check(an?.route_usage?.searches > 0 && an.route_usage.chosen > 0 && an.route_usage.top_trips.length > 0,
    `route usage: ${an?.route_usage?.searches} searches, ${an?.route_usage?.chosen} with a chosen route, ${an?.route_usage?.followed_pct}% followed the recommendation`);
  const events = await live.stop();
  if (events === null) warn("live alerts not checked (run: npm install --save-dev socket.io-client)");
  else {
    check(events.includes(`incident:new:${id1}`), "live alert incident:new arrived");
    check(events.includes(`incident:verified:${id1}`), "live alert incident:verified arrived");
  }

  // ---------- failure states ----------
  step("Failure states (must give clear errors, never crash)");
  const expect = async (label, res, status, code) =>
    check(res.status === status && res.success === false && (!code || res.error?.code === code), `${label} -> ${status} ${code || ""}`,
      `${label}: expected ${status} ${code || ""}, got ${res.status} ${res.error?.code}`);
  await expect("no login", await call("POST", "/routes/compare", { body: {} }), 401, "UNAUTHORIZED");
  await expect("bad token", await call("GET", "/auth/me", { token: "abc" }), 401, "UNAUTHORIZED");
  await expect("user verifying", await call("POST", `/incidents/${id1}/resolve`, { token: user }), 403, "FORBIDDEN");
  await expect("bad route input", await call("POST", "/routes/compare", { token: user, body: { source: { lat: "x" } } }), 400, "VALIDATION_ERROR");
  await expect("click far from roads", await call("POST", "/routes/compare", { token: user, body: { source: { lat: 13.2, lng: 77.9 }, destination: TO } }), 400, "VALIDATION_ERROR");
  await expect("same source and destination", await call("POST", "/routes/compare", { token: user, body: { source: FROM, destination: FROM } }), 400, "VALIDATION_ERROR");
  await expect("unknown junction", await call("POST", "/routes/compare", { token: user, body: { source: { node_id: "n999999" }, destination: TO } }), 404, "NOT_FOUND");
  await expect("unknown incident", await call("GET", "/incidents/999999"), 404, "NOT_FOUND");
  await expect("verify twice", await call("POST", `/incidents/${id1}/verify`, { token: admin }), 409, "CONFLICT");
  await expect("report in the sea", await call("POST", "/incidents", { token: user, body: { category: "accident", reported_severity: "low", lat: 13.5, lng: 78 } }), 400, "VALIDATION_ERROR");
  await expect("bad horizon", await call("GET", "/predictions?horizon=45"), 400, "VALIDATION_ERROR");
  await expect("unknown URL", await call("GET", "/nope"), 404, "NOT_FOUND");
  const badJson = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{oops" });
  check(badJson.status === 400, "broken JSON body -> 400");

  // NO_ROUTE: close the only road into a dead-end junction, then route to it
  const degree = new Map();
  for (const e of graph.edges) for (const n of [e.from, e.to]) degree.set(n, (degree.get(n) || 0) + 1);
  const deadEnd = graph.edges.find((e) => !e.oneway && degree.get(e.to) === 1 && e.to !== FROM.node_id);
  if (deadEnd) {
    const [dl, dg] = midpoint(deadEnd);
    const c = await call("POST", "/incidents", { token: user, body: { category: "closure", reported_severity: "high", lat: dl, lng: dg } });
    if (c.success && c.data.incident.segment_id === deadEnd.id) {
      await call("POST", `/incidents/${c.data.incident.id}/verify`, { token: admin });
      await expect("route to a cut-off junction", await call("POST", "/routes/compare", { token: user, body: { source: FROM, destination: { node_id: deadEnd.to } } }), 422, "NO_ROUTE");
      await call("POST", `/incidents/${c.data.incident.id}/resolve`, { token: admin });
    } else warn("could not place a closure on a dead-end road; NO_ROUTE not checked");
  }

  // tidy up: resolve the test accident so the map is not left with it
  await call("POST", `/incidents/${id1}/resolve`, { token: admin });
  finish();
})().catch((err) => { console.error("\nDemo check crashed:", err); process.exit(1); });

// Listens for Socket.IO alerts while the check runs (skipped if socket.io-client is not installed)
async function listenForEvents() {
  let ioClient;
  try { ioClient = require("socket.io-client").io; } catch { return { stop: async () => null }; }
  const events = [];
  const socket = ioClient(BASE, { transports: ["websocket"] });
  socket.on("incident:new", (d) => events.push(`incident:new:${d.incident.id}`));
  socket.on("incident:verified", (d) => events.push(`incident:verified:${d.incident.id}`));
  await new Promise((r) => { socket.on("connect", r); setTimeout(r, 2000); });
  return { stop: async () => { await new Promise((r) => setTimeout(r, 300)); socket.close(); return events; } };
}

function finish() {
  console.log(`\n${failed === 0 ? "✅ DEMO READY" : "❌ FIX BEFORE THE DEMO"}: ${passed} passed, ${failed} failed, ${warned} warnings`);
  console.log("Run `node scripts/seed-demo.js --reset` for clean demo data.");
  process.exitCode = failed ? 1 : 0;
}
