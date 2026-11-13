const router = require("express").Router();
const c = require("../controllers/phase4Controller");
const { requireAuth } = require("../middleware/auth");

router.get("/junctions", requireAuth, c.junctions);
router.post("/simulate", requireAuth, c.simulate);

module.exports = router;
