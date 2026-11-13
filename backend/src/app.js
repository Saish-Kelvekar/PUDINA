const express = require("express");
const cors = require("cors");
const { ok, fail } = require("./utils/response");
const { query } = require("./config/db");
const AppError = require("./utils/AppError");
const authRoutes = require("./routes/authRoutes");
const mapRoutes = require("./routes/mapRoutes");
const trafficRoutes = require("./routes/trafficRoutes");
const routeRoutes = require("./routes/routeRoutes");
const incidentRoutes = require("./routes/incidentRoutes");
const predictionRoutes = require("./routes/predictionRoutes");
const signalRoutes = require("./routes/signalRoutes");
const emergencyRoutes = require("./routes/emergencyRoutes");
const ml = require("./services/mlClient");

const app = express();
app.use(cors());          // lets the React app (another port) call us
app.use(express.json());  // reads JSON request bodies

// ---------- 1. Routes ----------

// Health check: is the server up, and can it reach the database?
app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1");
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", "Database not reachable");
  }
  let mlService;
  try {
    const h = await ml.health();
    mlService = { status: "up", model_version: h.model_version };
  } catch (err) {
    mlService = { status: "down", reason: err.reason || err.message };
  }
  return ok(res, { status: "ok", database: "connected", ml_service: mlService });
});

app.use("/api/auth", authRoutes);
app.use("/api/map", mapRoutes);
app.use("/api/traffic", trafficRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/incidents", incidentRoutes);
app.use("/api/predictions", predictionRoutes);
app.use("/api/signals", signalRoutes);
app.use("/api/emergency", emergencyRoutes);
// New routes go here, above the 404 handler

// ---------- 2. 404: no route matched ----------
app.use((req, res) => fail(res, 404, "NOT_FOUND", `No route ${req.method} ${req.path}`));

// ---------- 3. Errors: always last ----------
app.use((err, req, res, next) => {
  if (err instanceof AppError) return fail(res, err.status, err.code, err.message, err.details);
  if (err.type === "entity.parse.failed") return fail(res, 400, "VALIDATION_ERROR", "Body is not valid JSON");
  console.error(err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong");
});

module.exports = app;
