// Live camera -> Telegram. No database and no real Telegram: fetch to Telegram is faked.
const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const { validateUpload, baseMime } = require("../src/validators/cameraValidator");
const telegram = require("../src/services/telegramService");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const app = require("../src/app");

const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

test("upload check: types, size, incident id, note", () => {
  assert.strictEqual(baseMime("video/webm;codecs=vp9"), "video/webm");
  assert.deepStrictEqual(validateUpload("photo", { contentType: "image/jpeg", body: jpg }), { mime: "image/jpeg", incidentId: null, note: null, danger: null, location: null });
  assert.strictEqual(validateUpload("video", { contentType: "video/mp4", body: jpg, query: { incident_id: "4" } }).incidentId, 4);
  assert.throws(() => validateUpload("photo", { contentType: "video/mp4", body: jpg }), /Invalid input/);
  assert.throws(() => validateUpload("photo", { contentType: "image/jpeg", body: Buffer.alloc(0) }));
  assert.throws(() => validateUpload("photo", { contentType: "image/jpeg", body: Buffer.alloc(11 * 1024 * 1024) }));
  assert.throws(() => validateUpload("photo", { contentType: "image/jpeg", body: jpg, query: { incident_id: "x" } }));
  assert.throws(() => validateUpload("photo", { contentType: "image/jpeg", body: jpg, query: { note: "a".repeat(201) } }));
});

test("telegram method: photo, mp4 as video, webm as file", () => {
  assert.strictEqual(telegram.pickMethod("photo", "image/jpeg").method, "sendPhoto");
  assert.strictEqual(telegram.pickMethod("video", "video/mp4").method, "sendVideo");
  assert.strictEqual(telegram.pickMethod("video", "video/webm").method, "sendDocument");
});

test("caption mentions the incident, user and note", () => {
  const c = telegram.buildCaption({
    user: { name: "Demo User", role: "user" },
    incident: { id: 7, category: "accident", status: "verified", lat: 12.93, lng: 77.56 },
    note: "two cars",
    at: new Date("2026-11-10T03:30:00Z"),
  });
  assert.match(c, /INCIDENT #7 · ACCIDENT · verified/);
  assert.match(c, /Demo User \(user\)/);
  assert.match(c, /09:00 am IST|9:00 am IST/i);
  assert.match(c, /two cars/);
});

// ---- HTTP: start the app on a free port, fake only the Telegram calls ----
async function withServer(fn) {
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/camera`;
  try { await fn(base); } finally { server.close(); }
}
const token = jwt.sign({ id: 999999, role: "user" }, process.env.JWT_SECRET);
const auth = { Authorization: `Bearer ${token}` };

test("http: login required, and clear error when Telegram is not set up", async () => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_CHAT_ID;
  await withServer(async (base) => {
    let r = await fetch(`${base}/photo`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: jpg });
    assert.strictEqual(r.status, 401);

    r = await fetch(`${base}/status`, { headers: auth });
    assert.strictEqual((await r.json()).data.telegram_configured, false);

    r = await fetch(`${base}/photo`, { method: "POST", headers: { ...auth, "Content-Type": "image/jpeg" }, body: jpg });
    assert.strictEqual(r.status, 503);
    assert.strictEqual((await r.json()).error.code, "TELEGRAM_NOT_CONFIGURED");

    r = await fetch(`${base}/photo`, { method: "POST", headers: { ...auth, "Content-Type": "text/plain" }, body: "hi" });
    assert.strictEqual(r.status, 400);
  });
});

test("http: photo and video reach Telegram with the right method; token never leaks", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:SECRET";
  process.env.TELEGRAM_CHAT_ID = "42";
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).startsWith("https://api.telegram.org/")) {
      calls.push({ url: String(url), form: opts.body });
      if (calls.length === 3) return new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 });
      return new Response(JSON.stringify({ ok: true, result: { message_id: calls.length } }));
    }
    return realFetch(url, opts);
  };
  try {
    await withServer(async (base) => {
      let r = await realFetch(`${base}/photo?note=hello`, { method: "POST", headers: { ...auth, "Content-Type": "image/jpeg" }, body: jpg });
      let b = await r.json();
      assert.strictEqual(r.status, 201, JSON.stringify(b));
      assert.strictEqual(b.data.sent_as, "sendPhoto");
      assert.match(calls[0].url, /\/sendPhoto$/);
      assert.strictEqual(calls[0].form.get("chat_id"), "42");
      assert.match(calls[0].form.get("caption"), /hello/);

      r = await realFetch(`${base}/video`, { method: "POST", headers: { ...auth, "Content-Type": "video/webm;codecs=vp9" }, body: jpg });
      b = await r.json();
      assert.strictEqual(b.data.sent_as, "sendDocument");

      r = await realFetch(`${base}/video`, { method: "POST", headers: { ...auth, "Content-Type": "video/mp4" }, body: jpg });
      b = await r.json();
      assert.strictEqual(r.status, 502);
      assert.match(b.error.message, /chat not found/);
      assert.ok(!JSON.stringify(b).includes("SECRET"));
    });
  } finally {
    global.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});

test("http: oversize video gets a clear 400", async () => {
  await withServer(async (base) => {
    const r = await fetch(`${base}/video`, { method: "POST", headers: { ...auth, "Content-Type": "video/mp4" }, body: Buffer.alloc(46 * 1024 * 1024) });
    assert.strictEqual(r.status, 400);
    assert.match((await r.json()).error.details[0].issue, /45 MB/);
  });
});

// ---- Danger level + location ----
test("upload check: danger level and browser location", () => {
  const v = validateUpload("photo", { contentType: "image/jpeg", body: jpg, query: { danger: "high", lat: "12.93", lng: "77.56" } });
  assert.strictEqual(v.danger, "high");
  assert.deepStrictEqual(v.location, { lat: 12.93, lng: 77.56 });
  assert.throws(() => validateUpload("photo", { contentType: "image/jpeg", body: jpg, query: { danger: "extreme" } }));
  assert.throws(() => validateUpload("photo", { contentType: "image/jpeg", body: jpg, query: { lat: "12.9" } }), /Invalid input/);
  assert.throws(() => validateUpload("photo", { contentType: "image/jpeg", body: jpg, query: { lat: "99", lng: "77" } }));
});

test("caption: danger level, lanes, closure and place", () => {
  const place = { lat: 12.93, lng: 77.56, road: "9th Main Road", distance_m: 40, maps_url: "https://maps.google.com/?q=12.930000,77.560000" };
  let c = telegram.buildCaption({ danger: { level: "high", source: "ai", confidence: 0.82, lanes_blocked: 2 }, place });
  assert.match(c, /🔴 Danger level: HIGH \(AI estimate, 82% sure\)/);
  assert.match(c, /2 lanes blocked/);
  assert.match(c, /Location: 9th Main Road \(about 40 m away\)/);
  assert.match(c, /maps\.google\.com\/\?q=12\.930000,77\.560000/);
  c = telegram.buildCaption({ danger: { level: "medium", source: "reported", is_closure: true, lanes_blocked: 2 } });
  assert.match(c, /🟠 Danger level: MEDIUM \(as reported\)/);
  assert.match(c, /Road closed/);
  assert.doesNotMatch(c, /lanes blocked/);
  c = telegram.buildCaption({ danger: { level: "low", source: "manual" }, place: { lat: 28.6, lng: 77.2, road: null, maps_url: "u" } });
  assert.match(c, /🟢 Danger level: LOW \(set by camera operator\)/);
  assert.match(c, /Location: 28\.60000, 77\.20000/);
});

test("place: nearest named road from the real graph", () => {
  const path = require("node:path");
  process.env.GRAPH_PATH = process.env.GRAPH_PATH || "../data/graph.json";
  const graphService = require("../src/services/graphService");
  if (!graphService.getGraph()) graphService.loadGraph();
  const { describePlace } = require("../src/services/placeService");
  const named = graphService.getGraph().edges.find((e) => e.name);
  const [lat, lng] = named.coords[0];
  const p = describePlace(lat, lng);
  assert.ok(p.road, "should find a road name");
  assert.ok(p.distance_m <= 5);
  assert.strictEqual(describePlace(lat, lng, named.id).road, named.name);
  const far = describePlace(28.61, 77.21); // Delhi: outside the covered area
  assert.strictEqual(far.road, null);
  assert.match(far.maps_url, /28\.610000,77\.210000/);
});

test("http: manual danger + location -> caption and a map pin reply", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "123:SECRET";
  process.env.TELEGRAM_CHAT_ID = "42";
  const realFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, opts) => {
    if (String(url).startsWith("https://api.telegram.org/")) {
      calls.push({ url: String(url), opts });
      return new Response(JSON.stringify({ ok: true, result: { message_id: 77 } }));
    }
    return realFetch(url, opts);
  };
  try {
    await withServer(async (base) => {
      const r = await realFetch(`${base}/photo?danger=high&lat=12.93&lng=77.56`, { method: "POST", headers: { ...auth, "Content-Type": "image/jpeg" }, body: jpg });
      const b = await r.json();
      assert.strictEqual(r.status, 201, JSON.stringify(b));
      assert.strictEqual(b.data.danger_level, "high");
      assert.strictEqual(b.data.map_pin_sent, true);
      assert.match(calls[0].opts.body.get("caption"), /Danger level: HIGH/);
      assert.match(calls[1].url, /\/sendLocation$/);
      const pin = JSON.parse(calls[1].opts.body);
      assert.deepStrictEqual([pin.latitude, pin.longitude, pin.reply_parameters.message_id], [12.93, 77.56, 77]);
    });
  } finally {
    global.fetch = realFetch;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  }
});
