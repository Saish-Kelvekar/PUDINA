// Distance from a clicked point to the roads, so a report lands on the right road.
const R = 6371000;
const toRad = (d) => (d * Math.PI) / 180;

// Distance in metres from point p to the straight piece a-b (all [lat, lng]).
// Over a few hundred metres the earth is flat enough to treat lat/lng as x/y (scaled to metres).
function pointToPieceM(p, a, b) {
  const kx = R * Math.cos(toRad(p[0])) * (Math.PI / 180), ky = R * (Math.PI / 180);
  const ax = (a[1] - p[1]) * kx, ay = (a[0] - p[0]) * ky;
  const bx = (b[1] - p[1]) * kx, by = (b[0] - p[0]) * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? -(ax * dx + ay * dy) / len2 : 0;  // where along a-b the closest point is (0..1)
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

// Closest road (edge) to a point, using every bend in its coords
function nearestSegment(edges, lat, lng) {
  let best = null, bestD = Infinity;
  for (const e of edges) {
    for (let i = 0; i < e.coords.length - 1; i++) {
      const d = pointToPieceM([lat, lng], e.coords[i], e.coords[i + 1]);
      if (d < bestD) { bestD = d; best = e; }
    }
  }
  return { edge: best, distance_m: Math.round(bestD) };
}

module.exports = { nearestSegment, pointToPieceM };
