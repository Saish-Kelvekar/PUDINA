const router = require("express").Router();
const c = require("../controllers/trafficController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.get("/flow", c.getFlow);
router.get("/clock", c.getClock);
router.post("/clock", requireAuth, requireRole("admin"), c.setClock);

module.exports = router;
