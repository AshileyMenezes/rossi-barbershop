const express = require("express");
const router = express.Router();
const bookingsController = require("../controllers/bookings.controller");
const { authAdmin } = require("../middlewares/auth.middleware");

// Rota Pública: Cliente solicita agendamento (criado com status PENDENTE)
router.post("/", bookingsController.createBooking);

// Rotas Administrativas Protegidas (Exigem chave/token de administrador):
// Listagem geral de agendamentos (com suporte a filtros por status e data)
router.get("/", authAdmin, bookingsController.listBookings);

// Listagem específica de solicitações pendentes de aprovação
router.get("/pending", authAdmin, bookingsController.listPendingBookings);

// Operação administrativa: Barbeiro aprova a solicitação (PENDENTE -> CONFIRMADO)
router.patch("/:id/approve", authAdmin, bookingsController.approveBooking);

// Operação administrativa: Barbeiro recusa a solicitação (PENDENTE -> RECUSADO)
router.patch("/:id/reject", authAdmin, bookingsController.rejectBooking);

// Operação administrativa: Barbeiro marca atendimento como concluído (CONFIRMADO -> CONCLUÍDO)
router.patch("/:id/complete", authAdmin, bookingsController.completeBooking);

// Operação administrativa: Cancelamento de agendamento (PENDENTE/CONFIRMADO -> CANCELADO)
router.patch("/:id/cancel", authAdmin, bookingsController.cancelBooking);

module.exports = router;
