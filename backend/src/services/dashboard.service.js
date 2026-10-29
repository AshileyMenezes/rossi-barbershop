const prisma = require("../lib/prisma");
const financialService = require("./financial.service");
const availabilityService = require("./availability.service");

async function obterDadosDashboard() {
  const dataHoje = availabilityService.obterDataAtualLocal();
  const agora = new Date();
  const anoAtual = agora.getFullYear();
  const mesAtual = String(agora.getMonth() + 1).padStart(2, "0");
  const primeiroDiaMes = `${anoAtual}-${mesAtual}-01`;
  const ultimoDiaMesNum = new Date(anoAtual, agora.getMonth() + 1, 0).getDate();
  const ultimoDiaMes = `${anoAtual}-${mesAtual}-${String(ultimoDiaMesNum).padStart(2, "0")}`;

  // 1. Contagens de Agendamentos (Geral e Hoje)
  const [
    pendentesCount,
    confirmadosCount,
    concluidosCount,
    canceladosCount,
    atendimentosHojeCount
  ] = await Promise.all([
    prisma.booking.count({ where: { status: "PENDENTE" } }),
    prisma.booking.count({ where: { status: "CONFIRMADO" } }),
    prisma.booking.count({ where: { status: "CONCLUÍDO" } }),
    prisma.booking.count({ where: { status: "CANCELADO" } }),
    prisma.booking.count({
      where: {
        date: dataHoje,
        status: { in: ["CONFIRMADO", "CONCLUÍDO"] }
      }
    })
  ]);

  // 2. Resumo Financeiro do Mês
  const financeiroMes = await financialService.obterResumoFinanceiro({
    periodo: "mes",
    dataInicio: primeiroDiaMes,
    dataFim: ultimoDiaMes
  });

  // 3. Solicitações Pendentes aguardando aprovação (com dados completos)
  const solicitacoesPendentes = await prisma.booking.findMany({
    where: { status: "PENDENTE" },
    include: { service: true, client: true },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 10
  });

  // 4. Próximos Atendimentos Confirmados (a partir de hoje)
  const proximosAtendimentos = await prisma.booking.findMany({
    where: {
      date: { gte: dataHoje },
      status: "CONFIRMADO"
    },
    include: { service: true, client: true },
    orderBy: [{ date: "asc" }, { time: "asc" }],
    take: 10
  });

  // 5. Últimas Movimentações Financeiras
  const ultimasTransacoes = await prisma.transaction.findMany({
    take: 8,
    orderBy: [{ data: "desc" }, { id: "desc" }],
    include: { client: true, booking: { include: { service: true } } }
  });

  // 6. Desempenho Diário do Mês (soma de receitas recebidas por dia para gráfico)
  const transacoesPagasMes = await prisma.transaction.findMany({
    where: {
      data: { gte: primeiroDiaMes, lte: ultimoDiaMes },
      tipo: "RECEITA",
      status: "PAGO"
    },
    select: { data: true, valor: true }
  });

  const faturamentoPorDia = {};
  for (let dia = 1; dia <= ultimoDiaMesNum; dia++) {
    const diaFormatado = `${anoAtual}-${mesAtual}-${String(dia).padStart(2, "0")}`;
    faturamentoPorDia[diaFormatado] = 0;
  }

  transacoesPagasMes.forEach(t => {
    if (faturamentoPorDia[t.data] !== undefined) {
      faturamentoPorDia[t.data] += Number(t.valor);
    }
  });

  return {
    dataHoje,
    mesReferencia: `${mesAtual}/${anoAtual}`,
    indicadores: {
      agendamentosPendentes: pendentesCount,
      agendamentosConfirmados: confirmadosCount,
      atendimentosHoje: atendimentosHojeCount,
      atendimentosConcluidos: concluidosCount,
      agendamentosCancelados: canceladosCount,
      receitasRecebidasMes: financeiroMes.indicadores.receitaRecebida,
      valoresPendentesMes: financeiroMes.indicadores.valoresPendentesRecebimento,
      despesasMes: financeiroMes.indicadores.despesasPagas,
      despesasPendentesMes: financeiroMes.indicadores.despesasPendentes,
      saldoMes: financeiroMes.indicadores.saldoFinanceiro
    },
    solicitacoesPendentes: solicitacoesPendentes.map(b => ({
      id: b.id,
      cliente: b.clientName,
      telefone: b.clientPhone,
      servico: b.service ? b.service.nome : "Serviço",
      duracao: b.service ? b.service.duracao : 0,
      preco: b.service ? Number(b.service.preco) : 0,
      data: b.date,
      horario: b.time,
      status: b.status,
      solicitadoEm: b.createdAt
    })),
    proximosAtendimentos: proximosAtendimentos.map(b => ({
      id: b.id,
      cliente: b.clientName,
      telefone: b.clientPhone,
      servico: b.service ? b.service.nome : "Serviço",
      duracao: b.service ? b.service.duracao : 0,
      preco: b.service ? Number(b.service.preco) : 0,
      data: b.date,
      horario: b.time,
      status: b.status
    })),
    ultimasMovimentacoes: ultimasTransacoes.map(t => ({
      id: t.id,
      tipo: t.tipo,
      descricao: t.descricao,
      categoria: t.categoria,
      valor: Number(t.valor),
      data: t.data,
      metodoPagamento: t.metodoPagamento,
      status: t.status,
      cliente: t.client ? t.client.nome : null
    })),
    faturamentoDiarioMes: Object.entries(faturamentoPorDia).map(([data, total]) => ({
      data,
      dia: Number(data.slice(8)),
      total: Number(total.toFixed(2))
    }))
  };
}

module.exports = {
  obterDadosDashboard
};
