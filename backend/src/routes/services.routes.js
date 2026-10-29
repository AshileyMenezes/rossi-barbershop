const express = require("express");
const router = express.Router();
const servicesController = require("../controllers/services.controller");

// Rota GET /api/services
router.get("/", servicesController.getServices);

module.exports = router;
