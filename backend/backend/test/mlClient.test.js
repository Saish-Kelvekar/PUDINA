// The ML client must turn every kind of failure into MlUnavailableError (so callers fall back).
const test = require("node:test");
const assert = require("node:assert");
const http = require("http");

function fakeService(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler).listen(0, () => resolve(server));
  });
}

async function withService(handler, fn) {
  const server = await fakeService(handler);
  process.env.ML_SERVICE_URL = `http://localhost:${server.address().port}`;
  delete require.cache[require.resolve("../src/services/mlClient")];
  try { await fn(require("../src/services/mlClient")); } finally { server.close(); }
}

test("a working service: answer comes back as JSON", async () => {
  await withService((req, res) => res.end(JSON.stringify({ status: "ok", model_version: "rf-v1" })), async (ml) => {
    assert.deepStrictEqual(await ml.health(), { status: "ok", model_version: "rf-v1" });
  });
});

test("a 400 answer becomes MlUnavailableError with the service's message", async () => {
  await withService((req, res) => { res.statusCode = 400; res.end(JSON.stringify({ detail: "as_of outside window" })); }, async (ml) => {
    await assert.rejects(ml.predict({ asOf: "x", horizon: 15 }), (e) => e instanceof ml.MlUnavailableError && /as_of outside window/.test(e.reason));
  });
});

test("a crash (500) becomes MlUnavailableError", async () => {
  await withService((req, res) => { res.statusCode = 500; res.end("boom"); }, async (ml) => {
    await assert.rejects(ml.metrics(), (e) => e instanceof ml.MlUnavailableError && /500/.test(e.reason));
  });
});

test("nothing running at the address becomes MlUnavailableError", async () => {
  process.env.ML_SERVICE_URL = "http://localhost:1"; // nothing listens on port 1
  delete require.cache[require.resolve("../src/services/mlClient")];
  const ml = require("../src/services/mlClient");
  await assert.rejects(ml.health(), (e) => e instanceof ml.MlUnavailableError && e.reason === "service not reachable");
});
