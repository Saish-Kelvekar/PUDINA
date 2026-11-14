// Live Trip (simulated vehicle position).
//   POST /api/trips/plan  { source, destination, route_type? }  -> route split into timed legs
// Read-only: nothing is saved, so Route Planner's "Recent searches" is not affected.
const router = require("express").Router();
const { ok } = require("../utils/response");
const { requireAuth } = require("../middleware/auth");
const { validateCompare } = require("../validators/routeValidator");
const tripService = require("../services/tripService");

router.post("/plan", requireAuth, async (req, res) => {
  const body = req.body || {};
  const { source, destination } = validateCompare({ source: body.source, destination: body.destination });
  return ok(res, await tripService.plan({ source, destination, routeType: body.route_type || "recommended" }));
});

module.exports = router;
