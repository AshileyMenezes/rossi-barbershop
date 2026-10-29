const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { authAdmin } = require("../middlewares/auth.middleware");

// Rota pública: Login com chave de acesso administrativa
router.post("/login", adminController.login);

// Rota protegida: Verifica se o token/chave atual é válido
router.get("/verify", authAdmin, adminController.verifyAuth);
router.get("/me", authAdmin, adminController.verifyAuth);

// Rota protegida: Dados completos dos indicadores do dashboard
router.get("/dashboard", authAdmin, adminController.getDashboard);

module.exports = router;
