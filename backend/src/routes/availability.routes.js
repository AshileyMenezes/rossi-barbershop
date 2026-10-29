const express = require("express");
const router = express.Router();
const availabilityController = require("../controllers/availability.controller");

// Rota GET /api/availability?date=YYYY-MM-DD
router.get("/", availabilityController.getAvailability);

module.exports = router;
