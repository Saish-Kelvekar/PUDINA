const router = require("express").Router();
const c = require("../controllers/routeController");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth); // every route endpoint needs a login

router.post("/compare", c.compare);

// Search history: only the logged-in user's own searches
router.get("/history", c.listHistory);
router.delete("/history", c.clearHistory);
router.get("/history/:id", c.getHistory);
router.post("/history/:id/choose", c.chooseRoute);
router.delete("/history/:id", c.deleteHistory);

module.exports = router;
