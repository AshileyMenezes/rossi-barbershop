const prisma = require("../lib/prisma");

const METODOS_PAGAMENTO_VALIDOS = [
  "PIX",
  "CARTAO_CREDITO",
  "CARTAO_DEBITO",
  "DINHEIRO",
  "OUTRO"
];

const CATEGORIAS_RECEITA_PADRAO = [
  "Serviços",
  "Venda de Produtos",
  "Outras"
];

const CATEGORIAS_DESPESA_PADRAO = [
  "Aluguel",
  "Energia Elétrica",
  "Água",
  "Internet",
  "Produtos e Materiais",
  "Limpeza",
  "Manutenção e Equipamentos",
  "Salários e Pró-labore",
  "Impostos e Taxas",
  "Outras"
];

// Auxiliar para obter intervalo de datas
function obterIntervaloDatas(periodo, dataInicio, dataFim) {
  const agora = new Date();
  const formatarData = (d) => {
    const ano = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const dia = String(d.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  };

  const hojeStr = formatarData(agora);

  if (dataInicio && dataFim) {
    return { inicio: dataInicio, fim: dataFim };
  }

  if (periodo === "hoje") {
    return { inicio: hojeStr, fim: hojeStr };
  }

  if (periodo === "semana") {
    const diaSemana = agora.getDay(); // 0 domingo
    const primeiroDia = new Date(agora);
    primeiroDia.setDate(agora.getDate() - diaSemana);
    const ultimoDia = new Date(primeiroDia);
    ultimoDia.setDate(primeiroDia.getDate() + 6);
    return { inicio: formatarData(primeiroDia), fim: formatarData(ultimoDia) };
  }

  if (periodo === "ano") {
    const ano = agora.getFullYear();
    return { inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
  }

  if (periodo === "tudo") {
    return { inicio: "2020-01-01", fim: "2099-12-31" };
  }

  // Padrão: mês atual
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const ultimoDiaMes = new Date(ano, agora.getMonth() + 1, 0).getDate();
  return {
    inicio: `${ano}-${mes}-01`,
    fim: `${ano}-${mes}-${String(ultimoDiaMes).padStart(2, "0")}`
  };
}

// Resumo consolidado do módulo financeiro (visão da barbearia como um todo)
async function obterResumoFinanceiro({ periodo = "mes", dataInicio, dataFim } = {}) {
  const { inicio, fim } = obterIntervaloDatas(periodo, dataInicio, dataFim);

  // Consulta todas as transações dentro do período
  const transacoes = await prisma.transaction.findMany({
    where: {
      data: { gte: inicio, lte: fim }
    },
    include: {
      booking: { include: { service: true } },
      client: true
    },
    orderBy: { data: "desc" }
  });

  // 1. Receitas recebidas (efetivamente pagas)
  const receitasPagas = transacoes
    .filter(t => t.tipo === "RECEITA" && t.status === "PAGO")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  // 2. Receitas pendentes manuais
  const receitasPendentesManuais = transacoes
    .filter(t => t.tipo === "RECEITA" && t.status === "PENDENTE")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  // 3. Atendimentos concluídos no período e ainda não totalmente pagos (a receber)
  const agendamentosConcluidos = await prisma.booking.findMany({
    where: {
      date: { gte: inicio, lte: fim },
      status: "CONCLUÍDO"
    },
    include: {
      service: true,
      transactions: {
        where: { tipo: "RECEITA", status: "PAGO" }
      }
    }
  });

  let receitasPendentesAgendamentos = 0;
  for (const ag of agendamentosConcluidos) {
    const precoServico = ag.service ? Number(ag.service.preco) : 0;
    const totalPago = ag.transactions.reduce((acc, t) => acc + Number(t.valor), 0);
    if (precoServico > totalPago) {
      receitasPendentesAgendamentos += (precoServico - totalPago);
    }
  }

  const receitasPendentesTotal = receitasPendentesManuais + receitasPendentesAgendamentos;
  const receitaPrevista = receitasPagas + receitasPendentesTotal;

  // 4. Despesas pagas e pendentes
  const despesasPagas = transacoes
    .filter(t => t.tipo === "DESPESA" && t.status === "PAGO")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  const despesasPendentes = transacoes
    .filter(t => t.tipo === "DESPESA" && t.status === "PENDENTE")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  const totalDespesas = despesasPagas + despesasPendentes;

  // 5. Saldo financeiro realizado e resultado do período
  const saldoAtual = receitasPagas - despesasPagas;
  const resultadoProjetado = receitaPrevista - totalDespesas;

  // 6. Distribuição por método de pagamento (Receitas pagas)
  const porMetodo = {
    PIX: 0,
    CARTAO_CREDITO: 0,
    CARTAO_DEBITO: 0,
    DINHEIRO: 0,
    OUTRO: 0
  };

  transacoes
    .filter(t => t.tipo === "RECEITA" && t.status === "PAGO" && t.metodoPagamento)
    .forEach(t => {
      const metodo = t.metodoPagamento.toUpperCase();
      if (porMetodo[metodo] !== undefined) {
        porMetodo[metodo] += Number(t.valor);
      } else {
        porMetodo.OUTRO += Number(t.valor);
      }
    });

  // 7. Distribuição por categorias
  const porCategoriaReceita = {};
  transacoes
    .filter(t => t.tipo === "RECEITA" && t.status === "PAGO")
    .forEach(t => {
      porCategoriaReceita[t.categoria] = (porCategoriaReceita[t.categoria] || 0) + Number(t.valor);
    });

  const porCategoriaDespesa = {};
  transacoes
    .filter(t => t.tipo === "DESPESA" && t.status === "PAGO")
    .forEach(t => {
      porCategoriaDespesa[t.categoria] = (porCategoriaDespesa[t.categoria] || 0) + Number(t.valor);
    });

  return {
    periodo: { nome: periodo, dataInicio: inicio, dataFim: fim },
    indicadores: {
      receitaRecebida: Number(receitasPagas.toFixed(2)),
      receitaPrevista: Number(receitaPrevista.toFixed(2)),
      valoresPendentesRecebimento: Number(receitasPendentesTotal.toFixed(2)),
      despesasPagas: Number(despesasPagas.toFixed(2)),
      despesasPendentes: Number(despesasPendentes.toFixed(2)),
      totalDespesas: Number(totalDespesas.toFixed(2)),
      saldoFinanceiro: Number(saldoAtual.toFixed(2)),
      resultadoProjetado: Number(resultadoProjetado.toFixed(2))
    },
    porMetodo,
    porCategoria: {
      receitas: porCategoriaReceita,
      despesas: porCategoriaDespesa
    },
    totalTransacoes: transacoes.length,
    ultimasTransacoes: transacoes.slice(0, 10).map(formatarTransacao)
  };
}

function formatarTransacao(t) {
  return {
    id: t.id,
    tipo: t.tipo,
    descricao: t.descricao,
    categoria: t.categoria,
    valor: Number(t.valor),
    data: t.data,
    dataVencimento: t.dataVencimento,
    dataPagamento: t.dataPagamento,
    metodoPagamento: t.metodoPagamento,
    status: t.status,
    observacoes: t.observacoes,
    bookingId: t.bookingId,
    cliente: t.client ? { id: t.client.id, nome: t.client.nome, telefone: t.client.telefone } : null,
    criadoEm: t.createdAt
  };
}

// Listar transações com filtros
async function listarTransacoes({ tipo, status, categoria, dataInicio, dataFim, metodoPagamento, busca } = {}) {
  const where = {};

  if (tipo) where.tipo = tipo;
  if (status) where.status = status;
  if (categoria) where.categoria = categoria;
  if (metodoPagamento) where.metodoPagamento = metodoPagamento;

  if (dataInicio && dataFim) {
    where.data = { gte: dataInicio, lte: dataFim };
  } else if (dataInicio) {
    where.data = { gte: dataInicio };
  } else if (dataFim) {
    where.data = { lte: dataFim };
  }

  if (busca && busca.trim()) {
    const termo = busca.trim();
    where.OR = [
      { descricao: { contains: termo, mode: "insensitive" } },
      { observacoes: { contains: termo, mode: "insensitive" } },
      { client: { nome: { contains: termo, mode: "insensitive" } } }
    ];
  }

  const transacoes = await prisma.transaction.findMany({
    where,
    include: {
      client: true,
      booking: { include: { service: true } }
    },
    orderBy: [{ data: "desc" }, { id: "desc" }]
  });

  return transacoes.map(formatarTransacao);
}

// Criação de receita ou despesa manual
async function criarTransacaoManual({
  tipo,
  descricao,
  categoria,
  valor,
  data,
  dataVencimento = null,
  dataPagamento = null,
  metodoPagamento = null,
  status = "PAGO",
  observacoes = null,
  clientId = null
}) {
  if (!tipo || (tipo !== "RECEITA" && tipo !== "DESPESA")) {
    const erro = new Error("Tipo inválido. Deve ser 'RECEITA' ou 'DESPESA'.");
    erro.status = 400;
    throw erro;
  }

  if (!descricao || !descricao.trim()) {
    const erro = new Error("A descrição da movimentação é obrigatória.");
    erro.status = 400;
    throw erro;
  }

  const valorNum = Number(valor);
  if (!Number.isFinite(valorNum) || valorNum <= 0) {
    const erro = new Error("O valor deve ser um número positivo maior que zero.");
    erro.status = 400;
    throw erro;
  }

  if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const erro = new Error("Data inválida. Use o formato YYYY-MM-DD.");
    erro.status = 400;
    throw erro;
  }

  if (status !== "PAGO" && status !== "PENDENTE" && status !== "CANCELADO") {
    const erro = new Error("Status inválido. Use 'PAGO', 'PENDENTE' ou 'CANCELADO'.");
    erro.status = 400;
    throw erro;
  }

  if (status === "PAGO" && !dataPagamento) {
    dataPagamento = data;
  }

  const transacao = await prisma.transaction.create({
    data: {
      tipo,
      descricao: descricao.trim(),
      categoria: categoria ? categoria.trim() : (tipo === "RECEITA" ? "Outras" : "Outras"),
      valor: valorNum,
      data,
      dataVencimento: dataVencimento || null,
      dataPagamento: status === "PAGO" ? dataPagamento : null,
      metodoPagamento: metodoPagamento || (tipo === "RECEITA" ? "OUTRO" : null),
      status,
      observacoes: observacoes ? observacoes.trim() : null,
      clientId: clientId ? Number(clientId) : null
    },
    include: { client: true }
  });

  return formatarTransacao(transacao);
}

// Registro de pagamento para um atendimento (suporta pagamentos divididos e parciais)
async function registrarPagamentoAgendamento({ bookingId, pagamentos, observacoes = null }) {
  const bId = Number(bookingId);
  if (!Number.isInteger(bId) || bId <= 0) {
    const erro = new Error("ID de agendamento inválido.");
    erro.status = 400;
    throw erro;
  }

  if (!Array.isArray(pagamentos) || pagamentos.length === 0) {
    const erro = new Error("É necessário informar ao menos uma forma de pagamento.");
    erro.status = 400;
    throw erro;
  }

  return await prisma.$transaction(async (tx) => {
    const agendamento = await tx.booking.findUnique({
      where: { id: bId },
      include: {
        service: true,
        transactions: { where: { tipo: "RECEITA", status: "PAGO" } }
      }
    });

    if (!agendamento) {
      const erro = new Error("Agendamento não encontrado.");
      erro.status = 404;
      throw erro;
    }

    if (agendamento.status === "CANCELADO" || agendamento.status === "RECUSADO") {
      const erro = new Error(`Não é possível registrar pagamento para um agendamento com status '${agendamento.status}'.`);
      erro.status = 400;
      throw erro;
    }

    const precoTotalDevido = agendamento.service ? Number(agendamento.service.preco) : 0;
    const jaPago = agendamento.transactions.reduce((acc, t) => acc + Number(t.valor), 0);
    const saldoRestante = Number((precoTotalDevido - jaPago).toFixed(2));

    let somaNovosPagamentos = 0;
    for (const p of pagamentos) {
      const v = Number(p.valor);
      if (!Number.isFinite(v) || v <= 0) {
        const erro = new Error("Cada pagamento deve conter um valor positivo maior que zero.");
        erro.status = 400;
        throw erro;
      }
      somaNovosPagamentos += v;

      const metodo = String(p.metodoPagamento || "OUTRO").toUpperCase();
      if (!METODOS_PAGAMENTO_VALIDOS.includes(metodo)) {
        const erro = new Error(`Método de pagamento '${metodo}' não é válido.`);
        erro.status = 400;
        throw erro;
      }
    }

    somaNovosPagamentos = Number(somaNovosPagamentos.toFixed(2));

    if (somaNovosPagamentos > saldoRestante + 0.01) {
      const erro = new Error(
        `O valor total dos pagamentos (R$ ${somaNovosPagamentos.toFixed(2)}) ultrapassa o saldo restante devido (R$ ${saldoRestante.toFixed(2)}).`
      );
      erro.status = 400;
      throw erro;
    }

    const agora = new Date();
    const hojeStr = agora.toISOString().slice(0, 10);
    const criadas = [];

    for (const p of pagamentos) {
      const valorItem = Number(Number(p.valor).toFixed(2));
      const metodo = String(p.metodoPagamento).toUpperCase();
      const descricao = `Atendimento: ${agendamento.service?.nome || "Serviço"} - ${agendamento.clientName}`;

      const t = await tx.transaction.create({
        data: {
          tipo: "RECEITA",
          descricao,
          categoria: "Serviços",
          valor: valorItem,
          data: agendamento.date || hojeStr,
          dataPagamento: hojeStr,
          metodoPagamento: metodo,
          status: "PAGO",
          observacoes: observacoes || p.observacoes || null,
          bookingId: agendamento.id,
          clientId: agendamento.clientId
        }
      });
      criadas.push(t);
    }

    // Se o agendamento estava CONFIRMADO, passa para CONCLUÍDO
    const novoStatus = "CONCLUÍDO";
    await tx.booking.update({
      where: { id: agendamento.id },
      data: {
        status: novoStatus,
        observacoes: observacoes ? (agendamento.observacoes ? `${agendamento.observacoes} | ${observacoes}` : observacoes) : agendamento.observacoes
      }
    });

    const totalPagoFinal = jaPago + somaNovosPagamentos;
    const saldoFinal = Number((precoTotalDevido - totalPagoFinal).toFixed(2));

    return {
      bookingId: agendamento.id,
      cliente: agendamento.clientName,
      servico: agendamento.service?.nome,
      precoServico: precoTotalDevido,
      totalPagoAnterior: jaPago,
      pagamentoRegistrado: somaNovosPagamentos,
      totalPagoFinal,
      saldoRestante: Math.max(0, saldoFinal),
      statusAgendamento: novoStatus,
      quitado: totalPagoFinal >= precoTotalDevido,
      transacoesCriadas: criadas.map(formatarTransacao)
    };
  });
}

// Atualizar status de transação (ex: PAGO, CANCELADO)
async function atualizarTransacao(id, dados) {
  const tId = Number(id);
  if (!Number.isInteger(tId) || tId <= 0) {
    const erro = new Error("ID de transação inválido.");
    erro.status = 400;
    throw erro;
  }

  const data = {};
  if (dados.descricao) data.descricao = dados.descricao.trim();
  if (dados.categoria) data.categoria = dados.categoria.trim();
  if (dados.valor) data.valor = Number(dados.valor);
  if (dados.data) data.data = dados.data;
  if (dados.dataVencimento !== undefined) data.dataVencimento = dados.dataVencimento;
  if (dados.dataPagamento !== undefined) data.dataPagamento = dados.dataPagamento;
  if (dados.metodoPagamento) data.metodoPagamento = dados.metodoPagamento;
  if (dados.status) {
    data.status = dados.status;
    if (dados.status === "PAGO" && !data.dataPagamento) {
      data.dataPagamento = new Date().toISOString().slice(0, 10);
    }
  }
  if (dados.observacoes !== undefined) data.observacoes = dados.observacoes ? dados.observacoes.trim() : null;

  const atualizada = await prisma.transaction.update({
    where: { id: tId },
    data,
    include: { client: true, booking: true }
  });

  return formatarTransacao(atualizada);
}

module.exports = {
  METODOS_PAGAMENTO_VALIDOS,
  CATEGORIAS_RECEITA_PADRAO,
  CATEGORIAS_DESPESA_PADRAO,
  obterResumoFinanceiro,
  listarTransacoes,
  criarTransacaoManual,
  registrarPagamentoAgendamento,
  atualizarTransacao
};
