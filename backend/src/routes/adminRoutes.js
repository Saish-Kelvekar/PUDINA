const router = require("express").Router();
const c = require("../controllers/adminController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.use(requireAuth, requireRole("admin")); // everything here is admin only
router.get("/overview", c.overview);
router.get("/analytics", c.analytics);

module.exports = router;
