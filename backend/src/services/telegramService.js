// Sends camera photos / videos to a Telegram chat through the Bot API.
// The bot token and chat id live only in backend/.env — never in the frontend or in git.
// Uses Node's built-in fetch / FormData / Blob (Node 18+), so no extra package is needed.
const AppError = require("../utils/AppError");

const TELEGRAM_TIMEOUT_MS = 60000; // videos can take a while to upload

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

// Which Bot API method to use for a file.
// Telegram plays MP4 inline (sendVideo); other video formats (WebM) are sent as a file.
function pickMethod(kind, mime) {
  if (kind === "photo") return { method: "sendPhoto", field: "photo", ext: mime === "image/png" ? "png" : "jpg" };
  if (mime === "video/mp4") return { method: "sendVideo", field: "video", ext: "mp4" };
  return { method: "sendDocument", field: "document", ext: "webm" };
}

const DANGER = {
  high: { icon: "🔴", text: "HIGH" },
  medium: { icon: "🟠", text: "MEDIUM" },
  low: { icon: "🟢", text: "LOW" },
};

// danger: { level, source: "ai" | "reported" | "manual", confidence?, lanes_blocked?, is_closure? }
function dangerLines(danger) {
  if (!danger || !DANGER[danger.level]) return [];
  const d = DANGER[danger.level];
  let how = "";
  if (danger.source === "ai") how = ` (AI estimate${danger.confidence != null ? `, ${Math.round(danger.confidence * 100)}% sure` : ""})`;
  else if (danger.source === "reported") how = " (as reported)";
  else if (danger.source === "manual") how = " (set by camera operator)";
  const lines = [`${d.icon} Danger level: ${d.text}${how}`];
  if (danger.is_closure) lines.push("⛔ Road closed");
  else if (danger.lanes_blocked > 0) lines.push(`🚧 ${danger.lanes_blocked} lane${danger.lanes_blocked > 1 ? "s" : ""} blocked`);
  return lines;
}

// place: { lat, lng, road, distance_m, maps_url }
function placeLines(place) {
  if (!place) return [];
  const where = place.road
    ? `📍 Location: ${place.road}${place.distance_m ? ` (about ${place.distance_m} m away)` : ""}`
    : `📍 Location: ${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}`;
  return [where, `🗺 Map: ${place.maps_url}`];
}

// Telegram captions are limited to 1024 characters.
function buildCaption({ user, incident, danger, place, note, at = new Date() }) {
  const time = at.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" });
  const lines = [];
  if (incident) lines.push(`🚨 INCIDENT #${incident.id} · ${String(incident.category).toUpperCase()} · ${incident.status}`);
  else lines.push("📷 HUMSAFAR live camera");
  lines.push(...dangerLines(danger));
  lines.push(...placeLines(place));
  if (user) lines.push(`👤 ${user.name || "User"} (${user.role})`);
  lines.push(`🕒 ${time} IST`);
  if (note) lines.push(`📝 ${note}`);
  return lines.join("\n").slice(0, 1024);
}

async function sendMedia({ kind, buffer, mime, caption }) {
  if (!isConfigured()) {
    throw new AppError(503, "TELEGRAM_NOT_CONFIGURED", "Telegram is not set up. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to backend/.env");
  }
  const { method, field, ext } = pickMethod(kind, mime);
  const form = new FormData();
  form.append("chat_id", process.env.TELEGRAM_CHAT_ID);
  form.append("caption", caption);
  form.append(field, new Blob([buffer], { type: mime }), `trafficvision-${Date.now()}.${ext}`);
  if (method === "sendVideo") form.append("supports_streaming", "true");

  let res;
  try {
    res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
    });
  } catch (err) {
    // Never include the URL (it contains the token) in the message.
    const reason = err.name === "TimeoutError" ? "Telegram took too long to answer" : "Could not reach Telegram (check internet)";
    throw new AppError(502, "TELEGRAM_FAILED", reason);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    throw new AppError(502, "TELEGRAM_FAILED", `Telegram refused it: ${body.description || res.status}`);
  }
  return { method, message_id: body.result && body.result.message_id };
}

// Drops a map pin in the chat, as a reply to the photo/video. Best effort: never fails the upload.
async function sendLocation({ lat, lng, replyTo }) {
  if (!isConfigured()) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendLocation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        latitude: lat,
        longitude: lng,
        ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    return Boolean(res.ok && body.ok);
  } catch {
    return false;
  }
}

module.exports = { isConfigured, pickMethod, buildCaption, sendMedia, sendLocation };
