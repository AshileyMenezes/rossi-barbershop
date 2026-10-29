const express = require("express");
const router = express.Router();

// Rota GET /api/health
router.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    mensagem: "API Rossi Barbershop em pleno funcionamento!",
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
