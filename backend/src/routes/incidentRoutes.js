const router = require("express").Router();
const c = require("../controllers/incidentController");
const { requireAuth, requireRole } = require("../middleware/auth");

const admin = [requireAuth, requireRole("admin")];

router.post("/", requireAuth, c.create);   // any logged-in user can report
router.get("/", c.list);                   // public: shown on the map
router.get("/:id", c.getOne);
router.post("/:id/verify", ...admin, c.verify);
router.post("/:id/reject", ...admin, c.reject);
router.post("/:id/resolve", ...admin, c.resolve);

module.exports = router;
