const express = require("express");
const cors = require("cors");
const { ok, fail } = require("./utils/response");
const { query } = require("./config/db");
const AppError = require("./utils/AppError");
const authRoutes = require("./routes/authRoutes");
const mapRoutes = require("./routes/mapRoutes");

const app = express();
app.use(cors());          // lets the React app (another port) call us
app.use(express.json());  // reads JSON request bodies

// ---------- 1. Routes ----------

// Health check: is the server up, and can it reach the database?
app.get("/api/health", async (req, res) => {
  try {
    await query("SELECT 1");
    return ok(res, { status: "ok", database: "connected" });
  } catch (err) {
    return fail(res, 500, "INTERNAL_ERROR", "Database not reachable");
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/map", mapRoutes);
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