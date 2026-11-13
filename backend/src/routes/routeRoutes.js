const router = require("express").Router();
const c = require("../controllers/routeController");
const { requireAuth } = require("../middleware/auth");

router.post("/compare", requireAuth, c.compare);

module.exports = router;
