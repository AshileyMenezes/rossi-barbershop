const financialService = require("../services/financial.service");

async function getFinancialSummary(req, res) {
  try {
    const { periodo, dataInicio, dataFim } = req.query;
    const resumo = await financialService.obterResumoFinanceiro({
      periodo,
      dataInicio,
      dataFim
    });

    return res.status(200).json({
      sucesso: true,
      dados: resumo
    });
  } catch (error) {
    console.error("Erro no getFinancialSummary:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao gerar resumo financeiro consolidado."
    });
  }
}

async function listTransactions(req, res) {
  try {
    const { tipo, status, categoria, dataInicio, dataFim, metodoPagamento, busca } = req.query;
    const transacoes = await financialService.listarTransacoes({
      tipo,
      status,
      categoria,
      dataInicio,
      dataFim,
      metodoPagamento,
      busca
    });

    return res.status(200).json({
      sucesso: true,
      total: transacoes.length,
      dados: transacoes
    });
  } catch (error) {
    console.error("Erro no listTransactions:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao listar transações financeiras."
    });
  }
}

async function createTransaction(req, res) {
  try {
    const transacao = await financialService.criarTransacaoManual(req.body);
    return res.status(201).json({
      sucesso: true,
      mensagem: `${transacao.tipo === "RECEITA" ? "Receita" : "Despesa"} registrada com sucesso!`,
      dados: transacao
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao registrar transação financeira."
    });
  }
}

async function registerBookingPayment(req, res) {
  try {
    const { bookingId, pagamentos, observacoes } = req.body;
    const resultado = await financialService.registrarPagamentoAgendamento({
      bookingId,
      pagamentos,
      observacoes
    });

    return res.status(200).json({
      sucesso: true,
      mensagem: "Pagamento do atendimento registrado com sucesso!",
      dados: resultado
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao registrar pagamento do agendamento."
    });
  }
}

async function updateTransaction(req, res) {
  try {
    const { id } = req.params;
    const transacao = await financialService.atualizarTransacao(id, req.body);

    return res.status(200).json({
      sucesso: true,
      mensagem: "Transação financeira atualizada com sucesso!",
      dados: transacao
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao atualizar transação."
    });
  }
}

module.exports = {
  getFinancialSummary,
  listTransactions,
  createTransaction,
  registerBookingPayment,
  updateTransaction
};
