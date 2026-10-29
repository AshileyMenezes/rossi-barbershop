const express = require("express");
const router = express.Router();
const financialController = require("../controllers/financial.controller");
const { authAdmin } = require("../middlewares/auth.middleware");

// Todas as rotas do módulo financeiro são estritamente administrativas
router.use(authAdmin);

// Indicadores consolidados do dashboard financeiro
router.get("/summary", financialController.getFinancialSummary);

// Listagem detalhada de movimentações com filtros
router.get("/transactions", financialController.listTransactions);

// Lançamento manual de receita ou despesa
router.post("/transactions", financialController.createTransaction);

// Registro de pagamento para atendimento (suporta pagamentos divididos e parciais)
router.post("/payments", financialController.registerBookingPayment);

// Atualização de transação (ex: marcar como pago, alterar status)
router.put("/transactions/:id", financialController.updateTransaction);

module.exports = router;
