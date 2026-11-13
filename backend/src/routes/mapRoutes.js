const router = require("express").Router();
const c = require("../controllers/mapController");

router.get("/graph", c.getGraph);

module.exports = router;