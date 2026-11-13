// Talks to Member 3's FastAPI service (ML_SERVICE_URL, default http://localhost:8000).
// Every call gives up after ML_TIMEOUT_MS, so a slow or stopped service never blocks the website.
const { ML_TIMEOUT_MS } = require("../config/constants");

const BASE = () => (process.env.ML_SERVICE_URL || "http://localhost:8000").replace(/\/$/, "");

// Thrown when the service can't be used; callers then use their fallback
class MlUnavailableError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

async function call(method, path, body) {
  let res;
  try {
    res = await fetch(BASE() + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(ML_TIMEOUT_MS),
    });
  } catch (err) {
    const reason = err.name === "TimeoutError" ? `no answer within ${ML_TIMEOUT_MS / 1000} s` : "service not reachable";
    throw new MlUnavailableError(reason);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // 400 = it didn't accept our request (its message is in "detail"); 5xx = it crashed
    throw new MlUnavailableError(`ML service answered ${res.status}: ${(data && data.detail) || "no details"}`);
  }
  return data;
}

module.exports = {
  MlUnavailableError,
  health: () => call("GET", "/health"),
  predict: ({ asOf, horizon, segmentIds }) =>
    call("POST", "/predict", { as_of: asOf, horizon, segment_ids: segmentIds || [] }),
  metrics: ({ segmentId, horizon } = {}) =>
    call("GET", segmentId ? `/metrics?segment_id=${encodeURIComponent(segmentId)}&horizon=${horizon}` : "/metrics"),
  signalsOptimize: (body) => call("POST", "/signals/optimize", body), // used in Phase 4
};
