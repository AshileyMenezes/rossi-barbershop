const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controller");
const { authAdmin } = require("../middlewares/auth.middleware");

// Rota pública: Login com rate limiting e geração de token temporário
router.post("/login", adminController.login);

// Rotas protegidas: Verificação de sessão e logout
router.get("/verify", authAdmin, adminController.verifyAuth);
router.get("/me", authAdmin, adminController.verifyAuth);
router.post("/logout", authAdmin, adminController.logout);

// Rota protegida: Dados completos dos indicadores do dashboard
router.get("/dashboard", authAdmin, adminController.getDashboard);

module.exports = router;
