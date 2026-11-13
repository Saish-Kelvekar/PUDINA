const router = require("express").Router();
const c = require("../controllers/authController");
const { requireAuth } = require("../middleware/auth");

router.post("/register", c.register);
router.post("/login", c.login);
router.get("/me", requireAuth, c.me);

module.exports = router;
