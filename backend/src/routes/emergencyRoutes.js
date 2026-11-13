const router = require("express").Router();
const c = require("../controllers/phase4Controller");
const { requireAuth, requireRole } = require("../middleware/auth");

router.post("/routes", requireAuth, requireRole("emergency", "admin"), c.emergencyRoute);

module.exports = router;
