// Live camera -> Telegram.
//   GET  /api/camera/status        is Telegram set up?
//   POST /api/camera/photo         body = the image file (image/jpeg or image/png)
//   POST /api/camera/video         body = the video file (video/mp4 or video/webm)
// Optional query: ?incident_id=12&note=text
// Without an incident: ?danger=low|medium|high&lat=12.93&lng=77.56 (from the browser)
const express = require("express");
const { ok } = require("../utils/response");
const { query } = require("../config/db");
const AppError = require("../utils/AppError");
const { requireAuth } = require("../middleware/auth");
const telegram = require("../services/telegramService");
const { describePlace } = require("../services/placeService");
const { LIMITS, validateUpload } = require("../validators/cameraValidator");

const router = express.Router();
router.use(requireAuth);

// Reads the raw file body; turns "too large" into a clear 400 instead of a 500.
function rawBody(kind) {
  const parse = express.raw({ type: ["image/*", "video/*"], limit: LIMITS[kind] + 1024 });
  return (req, res, next) =>
    parse(req, res, (err) => {
      if (!err) return next();
      if (err.type === "entity.too.large") {
        return next(new AppError(400, "VALIDATION_ERROR", "Invalid input", [
          { field: "file", issue: `is larger than ${LIMITS[kind] / (1024 * 1024)} MB` },
        ]));
      }
      return next(err);
    });
}

// Extra details for the caption. If the database lookup fails we still send the file.
async function lookupUser(id) {
  try {
    const { rows } = await query("SELECT name, role FROM users WHERE id = $1", [id]);
    return rows[0] || null;
  } catch {
    return null;
  }
}
// Danger level: the AI estimate if there is one, otherwise what the reporter said.
function incidentDanger(inc) {
  const ai = Boolean(inc.estimated_severity);
  return {
    level: inc.estimated_severity || inc.reported_severity,
    source: ai ? "ai" : "reported",
    confidence: ai && inc.severity_confidence != null ? Number(inc.severity_confidence) : null,
    lanes_blocked: inc.lanes_blocked || 0,
    is_closure: Boolean(inc.is_closure),
  };
}

async function lookupIncident(id) {
  const { rows } = await query(
    `SELECT id, category, status, lat, lng, segment_id, reported_severity, estimated_severity,
            severity_confidence, lanes_blocked, is_closure
       FROM incidents WHERE id = $1`,
    [id],
  );
  if (!rows[0]) throw new AppError(404, "NOT_FOUND", `Incident ${id} not found`);
  return rows[0];
}

function send(kind) {
  return async (req, res) => {
    const { mime, incidentId, note, danger: manualDanger, location } = validateUpload(kind, {
      contentType: req.headers["content-type"],
      body: req.body,
      query: req.query,
    });
    const incident = incidentId ? await lookupIncident(incidentId) : null;

    let danger = null;
    let place = null;
    if (incident) {
      danger = incidentDanger(incident);
      place = describePlace(incident.lat, incident.lng, incident.segment_id);
    } else {
      if (manualDanger) danger = { level: manualDanger, source: "manual" };
      if (location) place = describePlace(location.lat, location.lng);
    }

    const user = (await lookupUser(req.user.id)) || { role: req.user.role };
    const caption = telegram.buildCaption({ user, incident, danger, place, note });
    const sent = await telegram.sendMedia({ kind, buffer: req.body, mime, caption });
    const pinSent = place ? await telegram.sendLocation({ lat: place.lat, lng: place.lng, replyTo: sent.message_id }) : false;

    return ok(res, {
      sent: true,
      kind,
      sent_as: sent.method,
      size_kb: Math.round(req.body.length / 1024),
      incident_id: incidentId,
      danger_level: danger ? danger.level : null,
      location: place ? { lat: place.lat, lng: place.lng, road: place.road, maps_url: place.maps_url } : null,
      map_pin_sent: pinSent,
      telegram_message_id: sent.message_id,
    }, 201);
  };
}

router.get("/status", (req, res) =>
  ok(res, {
    telegram_configured: telegram.isConfigured(),
    limits_mb: { photo: LIMITS.photo / (1024 * 1024), video: LIMITS.video / (1024 * 1024) },
  }));
router.post("/photo", rawBody("photo"), send("photo"));
router.post("/video", rawBody("video"), send("video"));

module.exports = router;
