const AppError = require("./utils/AppError");
const authRoutes = require("./routes/authRoutes");
const express = require("express");
const cors = require("cors");
const { ok, fail } = require("./utils/response");
const { query } = require("./config/db");

const app = express();
app.use(cors());          // lets the React app (another port) call us
app.use(express.json());  // reads JSON request bodies

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

// Any unknown URL -> 404 in our format
app.use((req, res) => fail(res, 404, "NOT_FOUND", `No route ${req.method} ${req.path}`));

// Any crash inside a route -> 500 in our format (never an HTML error page)
app.use((err, req, res, next) => {
  if (err instanceof AppError) return fail(res, err.status, err.code, err.message, err.details);
  if (err.type === "entity.parse.failed") return fail(res, 400, "VALIDATION_ERROR", "Body is not valid JSON");
  console.error(err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong");
});

module.exports = app;