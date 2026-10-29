const express = require("express");
const router = express.Router();
const clientsController = require("../controllers/clients.controller");
const { authAdmin } = require("../middlewares/auth.middleware");

// Todas as rotas de clientes são protegidas (dados sensíveis sob LGPD)
router.use(authAdmin);

// Lista todos os clientes cadastrados com busca e histórico
router.get("/", clientsController.listClients);

// Sincroniza agendamentos anteriores com a base unificada de clientes
router.post("/sync", clientsController.syncClients);

// Obtém o perfil completo do cliente por ID
router.get("/:id", clientsController.getClientDetails);

// Atualiza informações ou anotações do cliente
router.put("/:id", clientsController.updateClient);

module.exports = router;
