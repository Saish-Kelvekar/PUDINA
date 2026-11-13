const AppError = require("../utils/AppError");

const CATEGORIES = ["accident", "breakdown", "roadwork", "flooding", "closure", "event", "other"];
const SEVERITIES = ["low", "medium", "high"];
const STATUSES = ["pending", "verified", "rejected", "merged", "resolved"];

function validateCreate(b) {
  const errors = [];
  if (!CATEGORIES.includes(b.category)) errors.push({ field: "category", issue: `one of ${CATEGORIES.join(", ")}` });
  if (!SEVERITIES.includes(b.reported_severity)) errors.push({ field: "reported_severity", issue: "low, medium or high" });
  if (typeof b.lat !== "number" || b.lat < -90 || b.lat > 90) errors.push({ field: "lat", issue: "number between -90 and 90" });
  if (typeof b.lng !== "number" || b.lng < -180 || b.lng > 180) errors.push({ field: "lng", issue: "number between -180 and 180" });
  if (b.description !== undefined && (typeof b.description !== "string" || b.description.length > 500)) {
    errors.push({ field: "description", issue: "text up to 500 characters" });
  }
  const lanes = b.lanes_blocked === undefined ? 0 : b.lanes_blocked;
  if (!Number.isInteger(lanes) || lanes < 0 || lanes > 10) errors.push({ field: "lanes_blocked", issue: "whole number 0-10" });
  if (b.is_closure !== undefined && typeof b.is_closure !== "boolean") errors.push({ field: "is_closure", issue: "true or false" });
  if (errors.length) throw new AppError(400, "VALIDATION_ERROR", "Invalid input", errors);
  return {
    category: b.category, description: (b.description || "").trim(), lat: b.lat, lng: b.lng,
    reportedSeverity: b.reported_severity, lanesBlocked: lanes,
    isClosure: b.is_closure === true || b.category === "closure",
  };
}

// ?status=pending,verified&category=accident&since=2026-11-10T00:00:00Z
function validateListQuery(q) {
  const statuses = q.status ? String(q.status).split(",").map((s) => s.trim()) : ["pending", "verified", "resolved"];
  const bad = statuses.filter((s) => !STATUSES.includes(s));
  if (bad.length) throw new AppError(400, "VALIDATION_ERROR", `Unknown status: ${bad.join(", ")}`);
  if (q.category && !CATEGORIES.includes(q.category)) throw new AppError(400, "VALIDATION_ERROR", "Unknown category");
  let since = null;
  if (q.since) {
    since = new Date(q.since);
    if (Number.isNaN(since.getTime())) throw new AppError(400, "VALIDATION_ERROR", "since must be an ISO date");
  }
  return { statuses, category: q.category || null, since };
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, "VALIDATION_ERROR", "id must be a positive whole number");
  return id;
}

module.exports = { validateCreate, validateListQuery, parseId, CATEGORIES };
