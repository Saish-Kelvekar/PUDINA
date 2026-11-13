// Checks for camera uploads. The file arrives as the raw request body;
// small extras (incident id, note) come in the query string.
const AppError = require("../utils/AppError");

const LIMITS = {
  photo: 10 * 1024 * 1024, // 10 MB
  video: 45 * 1024 * 1024, // 45 MB (Telegram bots may upload up to 50 MB)
};
const ALLOWED = {
  photo: ["image/jpeg", "image/png"],
  video: ["video/mp4", "video/webm"],
};
const NOTE_MAX = 200;

const bad = (field, issue) => new AppError(400, "VALIDATION_ERROR", "Invalid input", [{ field, issue }]);

// "video/webm;codecs=vp9" -> "video/webm"
function baseMime(contentType) {
  return String(contentType || "").split(";")[0].trim().toLowerCase();
}

function validateUpload(kind, { contentType, body, query = {} }) {
  if (!ALLOWED[kind]) throw bad("kind", "must be photo or video");

  const mime = baseMime(contentType);
  if (!ALLOWED[kind].includes(mime)) throw bad("file", `type must be one of ${ALLOWED[kind].join(", ")}`);
  if (!Buffer.isBuffer(body) || body.length === 0) throw bad("file", "is empty");
  if (body.length > LIMITS[kind]) throw bad("file", `is larger than ${LIMITS[kind] / (1024 * 1024)} MB`);

  let incidentId = null;
  if (query.incident_id !== undefined && query.incident_id !== "") {
    incidentId = Number(query.incident_id);
    if (!Number.isInteger(incidentId) || incidentId < 1) throw bad("incident_id", "must be a positive whole number");
  }

  let note = null;
  if (query.note !== undefined) {
    note = String(query.note).trim();
    if (note.length > NOTE_MAX) throw bad("note", `must be at most ${NOTE_MAX} characters`);
    if (!note) note = null;
  }

  // Used only when no incident is linked (the incident's own danger level and place win).
  let danger = null;
  if (query.danger !== undefined && query.danger !== "") {
    if (!["low", "medium", "high"].includes(query.danger)) throw bad("danger", "must be low, medium or high");
    danger = query.danger;
  }

  let location = null;
  const hasLat = query.lat !== undefined && query.lat !== "";
  const hasLng = query.lng !== undefined && query.lng !== "";
  if (hasLat !== hasLng) throw bad(hasLat ? "lng" : "lat", "lat and lng must be sent together");
  if (hasLat) {
    const lat = Number(query.lat), lng = Number(query.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw bad("lat", "must be between -90 and 90");
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw bad("lng", "must be between -180 and 180");
    location = { lat, lng };
  }

  return { mime, incidentId, note, danger, location };
}

module.exports = { LIMITS, ALLOWED, baseMime, validateUpload };
