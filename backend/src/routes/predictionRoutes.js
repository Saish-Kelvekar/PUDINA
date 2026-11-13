const router = require("express").Router();
const c = require("../controllers/predictionController");

router.get("/", c.list);           // public: the map's purple layer
router.get("/metrics", c.metrics); // public: Prediction page

module.exports = router;
