const prisma = require("../lib/prisma");
const availabilityService = require("./availability.service");
const clientsService = require("./clients.service");

// Normalização e validação estrita de telefone brasileiro com DDD (Regra 3: Source-Level Security)
function normalizarTelefone(clientPhone) {
  if (typeof clientPhone !== "string") {
    const erro = new Error("O telefone informado deve ser uma string válida.");
    erro.status = 400;
    throw erro;
  }

  const digitos = clientPhone.replace(/\D/g, "");

  // Telefones válidos no Brasil com DDD possuem 10 dígitos (fixo) ou 11 dígitos (celular)
  if (digitos.length !== 10 && digitos.length !== 11) {
    const erro = new Error("Informe um número de telefone válido com DDD (10 ou 11 dígitos). Exemplo: (19) 99185-7275.");
    erro.status = 400;
    throw erro;
  }

  // O DDD deve estar no intervalo válido (11 a 99)
  const ddd = Number(digitos.slice(0, 2));
  if (ddd < 11 || ddd > 99) {
    const erro = new Error("O DDD informado é inválido.");
    erro.status = 400;
    throw erro;
  }

  // Celulares com 11 dígitos no Brasil obrigatoriamente iniciam com 9
  if (digitos.length === 11 && digitos[2] !== "9") {
    const erro = new Error("Celulares de 11 dígitos devem começar com o dígito 9 após o DDD.");
    erro.status = 400;
    throw erro;
  }

  // Impede sequências repetidas claramente inválidas (ex: 0000000000, 1111111111)
  if (/^(\d)\1+$/.test(digitos)) {
    const erro = new Error("O número de telefone informado não é válido.");
    erro.status = 400;
    throw erro;
  }

  // Formata no padrão legível
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
}

function formatarAgendamento(agendamento) {
  const transacoesPagas = agendamento.transactions
    ? agendamento.transactions.filter(t => t.tipo === "RECEITA" && t.status === "PAGO")
    : [];
  const totalPago = transacoesPagas.reduce((acc, t) => acc + Number(t.valor), 0);
  const precoServico = agendamento.service ? Number(agendamento.service.preco) : 0;
  const saldoRestante = Math.max(0, Number((precoServico - totalPago).toFixed(2)));

  return {
    id: agendamento.id,
    cliente: agendamento.clientName,
    telefone: agendamento.clientPhone,
    clientId: agendamento.clientId,
    servicoId: agendamento.service ? agendamento.service.id : agendamento.serviceId,
    servicoNome: agendamento.service ? agendamento.service.nome : undefined,
    duracao: agendamento.service ? agendamento.service.duracao : undefined,
    preco: precoServico,
    data: agendamento.date,
    horario: agendamento.time,
    status: agendamento.status,
    observacoes: agendamento.observacoes,
    financeiro: {
      totalPago: Number(totalPago.toFixed(2)),
      saldoRestante,
      quitado: totalPago >= precoServico && precoServico > 0,
      totalTransacoes: transacoesPagas.length
    },
    criadoEm: agendamento.createdAt,
    atualizadoEm: agendamento.updatedAt
  };
}

async function criarAgendamento({ serviceId, date, time, clientName, clientPhone, observacoes = null }) {
  // 0. Validação de integridade do nome
  const nomeLimpo = typeof clientName === "string" ? clientName.trim() : "";
  if (nomeLimpo.length < 3 || nomeLimpo.length > 50) {
    const erro = new Error("O nome do cliente deve conter entre 3 e 50 caracteres.");
    erro.status = 400;
    throw erro;
  }

  const regexApenasLetras = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;
  if (!regexApenasLetras.test(nomeLimpo)) {
    const erro = new Error("O nome deve conter apenas letras e espaços (sem números ou caracteres especiais).");
    erro.status = 400;
    throw erro;
  }

  // 1. Normalização e validação de telefone
  const telefoneFormatado = normalizarTelefone(clientPhone);

  // 2. Validação do ID do serviço
  const idServicoNumerico = Number(serviceId);
  if (!Number.isInteger(idServicoNumerico) || idServicoNumerico <= 0) {
    const erro = new Error("O serviceId informado deve ser um número inteiro positivo.");
    erro.status = 400;
    throw erro;
  }

  // 3. Busca o serviço oficial no PostgreSQL para recuperar preço e duração reais
  const servico = await prisma.service.findFirst({
    where: {
      id: idServicoNumerico,
      ativo: true
    }
  });

  if (!servico) {
    const erro = new Error("O serviço selecionado não existe ou não está ativo.");
    erro.status = 404;
    throw erro;
  }

  // 4. Validação real de calendário da data (Regra 3: Source-Level Security)
  if (!availabilityService.validarDataCalendario(date)) {
    const erro = new Error("A data informada é inválida ou não existe no calendário (formato: YYYY-MM-DD).");
    erro.status = 400;
    throw erro;
  }

  // 5. Validação de limites temporais (não permitir datas passadas e máximo 4 meses)
  const dataHoje = availabilityService.obterDataAtualLocal();
  const dataLimite = availabilityService.obterDataLimiteAgendamento(4);
  const horaHoje = availabilityService.obterHoraAtualLocal();

  if (date < dataHoje) {
    const erro = new Error("Não é possível realizar agendamentos em datas que já passaram.");
    erro.status = 400;
    throw erro;
  }

  if (date > dataLimite) {
    const [aLim, mLim, dLim] = dataLimite.split("-");
    const erro = new Error(`Agendamentos são permitidos com no máximo 4 meses de antecedência (limite disponível: ${dLim}/${mLim}/${aLim}).`);
    erro.status = 400;
    throw erro;
  }

  if (date === dataHoje && time <= horaHoje) {
    const erro = new Error(`O horário ${time} de hoje já ultrapassou. Por favor, escolha um horário futuro.`);
    erro.status = 400;
    throw erro;
  }

  const [ano, mes, dia] = date.split("-").map(Number);
  const diaSemana = new Date(ano, mes - 1, dia).getDay();

  if (diaSemana === 0 || diaSemana === 1) {
    const erro = new Error("A barbearia não abre aos domingos e segundas-feiras.");
    erro.status = 400;
    throw erro;
  }

  const horariosPermitidos = availabilityService.obterHorariosDoDia(diaSemana);
  if (!horariosPermitidos.includes(time)) {
    const erro = new Error("O horário selecionado não faz parte do expediente da barbearia neste dia.");
    erro.status = 400;
    throw erro;
  }

  // 6. Validação de duração e intervalos de expediente (almoço e fechamento)
  const [hNovo, mNovo] = time.split(":").map(Number);
  const inicioNovo = hNovo * 60 + mNovo;
  const fimNovo = inicioNovo + servico.duracao;

  let intervalosExpediente;
  if (diaSemana >= 2 && diaSemana <= 4) {
    intervalosExpediente = [[525, 720], [810, 1170]];
  } else if (diaSemana === 5) {
    intervalosExpediente = [[480, 720], [810, 1170]];
  } else if (diaSemana === 6) {
    intervalosExpediente = [[480, 720], [765, 900]];
  } else {
    intervalosExpediente = [];
  }

  const cabeNoExpediente = intervalosExpediente.some(
    ([abertura, fechamento]) =>
      inicioNovo >= abertura && fimNovo <= fechamento
  );

  if (!cabeNoExpediente) {
    const erro = new Error(
      "A duração do serviço ultrapassa o expediente ou atravessa o intervalo da barbearia."
    );
    erro.status = 400;
    throw erro;
  }

  // 7. Obtenção ou criação do cliente no cadastro unificado
  const cliente = await clientsService.obterOuCriarCliente({
    nome: nomeLimpo,
    telefone: telefoneFormatado
  });

  // 8. Proteção Atômica Contra Concorrência e Agendamentos Simultâneos no PostgreSQL
  try {
    const novoAgendamento = await prisma.$transaction(async (tx) => {
      // Bloqueio consultivo no PostgreSQL durante a transação para a data solicitada
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${date}))`;

      // Consulta agendamentos que bloqueiam horário (PENDENTE, CONFIRMADO e CONCLUÍDO)
      const agendamentosOcupados = await tx.booking.findMany({
        where: {
          date,
          status: { in: ["PENDENTE", "CONFIRMADO", "CONCLUÍDO"] }
        },
        select: {
          id: true,
          time: true,
          service: {
            select: {
              duracao: true
            }
          }
        }
      });

      // Validação de sobreposição de horários considerando as durações reais
      const temSobreposicao = agendamentosOcupados.some(agendamento => {
        const [horas, minutos] = agendamento.time.split(":").map(Number);
        const inicioExistente = horas * 60 + minutos;
        const fimExistente = inicioExistente + agendamento.service.duracao;

        return inicioNovo < fimExistente && fimNovo > inicioExistente;
      });

      if (temSobreposicao) {
        const erroConflito = new Error(
          "Este horário conflita com outro atendimento. Por favor, escolha outro horário."
        );
        erroConflito.status = 409;
        throw erroConflito;
      }

      // Cria o agendamento com status PENDENTE (aprovação manual necessária pelo barbeiro)
      return await tx.booking.create({
        data: {
          clientName: nomeLimpo,
          clientPhone: telefoneFormatado,
          clientId: cliente.id,
          serviceId: servico.id,
          date,
          time,
          status: "PENDENTE",
          observacoes: observacoes ? observacoes.trim() : null
        },
        include: {
          service: true,
          client: true,
          transactions: true
        }
      });
    });

    return formatarAgendamento(novoAgendamento);
  } catch (err) {
    if (err.code === "P2002") {
      const erroConflito = new Error("Desculpe, este horário acabou de ser reservado por outro cliente.");
      erroConflito.status = 409;
      throw erroConflito;
    }
    throw err;
  }
}

async function listarAgendamentos(filtros = {}) {
  const where = {};

  if (filtros.status) {
    if (Array.isArray(filtros.status)) {
      where.status = { in: filtros.status };
    } else {
      where.status = filtros.status;
    }
  }

  if (filtros.date) {
    where.date = filtros.date;
  } else if (filtros.dataInicio && filtros.dataFim) {
    where.date = { gte: filtros.dataInicio, lte: filtros.dataFim };
  } else if (filtros.dataInicio) {
    where.date = { gte: filtros.dataInicio };
  } else if (filtros.dataFim) {
    where.date = { lte: filtros.dataFim };
  }

  if (filtros.clientId) {
    where.clientId = Number(filtros.clientId);
  }

  if (filtros.busca && filtros.busca.trim()) {
    const termo = filtros.busca.trim();
    where.OR = [
      { clientName: { contains: termo, mode: "insensitive" } },
      { clientPhone: { contains: termo } }
    ];
  }

  const agendamentos = await prisma.booking.findMany({
    where,
    orderBy: [
      { date: "desc" },
      { time: "asc" }
    ],
    include: {
      service: true,
      client: true,
      transactions: true
    }
  });

  return agendamentos.map(formatarAgendamento);
}

async function obterAgendamentoPorId(id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    const erro = new Error("ID de agendamento inválido.");
    erro.status = 400;
    throw erro;
  }

  const agendamento = await prisma.booking.findUnique({
    where: { id: idNum },
    include: {
      service: true,
      client: true,
      transactions: true
    }
  });

  if (!agendamento) {
    const erro = new Error("Agendamento não encontrado.");
    erro.status = 404;
    throw erro;
  }

  return formatarAgendamento(agendamento);
}

// Operação Administrativa: Aprovação Manual (PENDENTE -> CONFIRMADO)
async function aprovarAgendamento(id) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    const erro = new Error("ID de agendamento inválido.");
    erro.status = 400;
    throw erro;
  }

  return await prisma.$transaction(async (tx) => {
    const agendamento = await tx.booking.findUnique({
      where: { id: idNum },
      include: { service: true }
    });

    if (!agendamento) {
      const erro = new Error("Agendamento não encontrado.");
      erro.status = 404;
      throw erro;
    }

    if (agendamento.status === "CONFIRMADO") {
      const erro = new Error("Este agendamento já está confirmado.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status === "CONCLUÍDO") {
      const erro = new Error("Este agendamento já foi concluído.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status === "RECUSADO") {
      const erro = new Error("Não é possível aprovar um agendamento recusado.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status === "CANCELADO") {
      const erro = new Error("Não é possível aprovar um agendamento cancelado.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status !== "PENDENTE") {
      const erro = new Error(`Transição de status inválida a partir de '${agendamento.status}'.`);
      erro.status = 400;
      throw erro;
    }

    // Bloqueio atômico para validar que nenhum outro agendamento foi confirmado sobrepondo esse horário
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${agendamento.date}))`;

    const outrosConfirmados = await tx.booking.findMany({
      where: {
        id: { not: agendamento.id },
        date: agendamento.date,
        status: { in: ["CONFIRMADO", "CONCLUÍDO"] }
      },
      include: { service: true }
    });

    const [h, m] = agendamento.time.split(":").map(Number);
    const inicio = h * 60 + m;
    const fim = inicio + agendamento.service.duracao;

    const temConflito = outrosConfirmados.some(outro => {
      const [oh, om] = outro.time.split(":").map(Number);
      const outroInicio = oh * 60 + om;
      const outroFim = outroInicio + outro.service.duracao;

      return inicio < outroFim && fim > outroInicio;
    });

    if (temConflito) {
      const erro = new Error("Não foi possível aprovar: já existe outro atendimento confirmado com horário sobreposto.");
      erro.status = 409;
      throw erro;
    }

    const agendamentoAprovado = await tx.booking.update({
      where: { id: agendamento.id },
      data: { status: "CONFIRMADO" },
      include: { service: true, client: true, transactions: true }
    });

    return formatarAgendamento(agendamentoAprovado);
  });
}

// Operação Administrativa: Recusa (PENDENTE -> RECUSADO) - Libera o horário
async function recusarAgendamento(id, motivo) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    const erro = new Error("ID de agendamento inválido.");
    erro.status = 400;
    throw erro;
  }

  return await prisma.$transaction(async (tx) => {
    const agendamento = await tx.booking.findUnique({
      where: { id: idNum },
      include: { service: true }
    });

    if (!agendamento) {
      const erro = new Error("Agendamento não encontrado.");
      erro.status = 404;
      throw erro;
    }

    if (agendamento.status === "RECUSADO") {
      const erro = new Error("Este agendamento já foi recusado.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status === "CANCELADO") {
      const erro = new Error("Não é possível recusar um agendamento cancelado.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status === "CONCLUÍDO") {
      const erro = new Error("Não é possível recusar um agendamento já concluído.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status === "CONFIRMADO") {
      const erro = new Error("Não é possível recusar um agendamento já confirmado. Para cancelá-lo, utilize o cancelamento.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status !== "PENDENTE") {
      const erro = new Error(`Transição de status inválida a partir de '${agendamento.status}'.`);
      erro.status = 400;
      throw erro;
    }

    const agendamentoRecusado = await tx.booking.update({
      where: { id: agendamento.id },
      data: {
        status: "RECUSADO",
        observacoes: motivo ? (agendamento.observacoes ? `${agendamento.observacoes} | Recusa: ${motivo}` : `Recusa: ${motivo}`) : agendamento.observacoes
      },
      include: { service: true, client: true, transactions: true }
    });

    return formatarAgendamento(agendamentoRecusado);
  });
}

// Operação Administrativa: Concluir Atendimento (CONFIRMADO -> CONCLUÍDO)
async function concluirAgendamento(id, { observacoes } = {}) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    const erro = new Error("ID de agendamento inválido.");
    erro.status = 400;
    throw erro;
  }

  return await prisma.$transaction(async (tx) => {
    const agendamento = await tx.booking.findUnique({
      where: { id: idNum },
      include: { service: true, client: true, transactions: true }
    });

    if (!agendamento) {
      const erro = new Error("Agendamento não encontrado.");
      erro.status = 404;
      throw erro;
    }

    if (agendamento.status === "CONCLUÍDO") {
      const erro = new Error("Este agendamento já está marcado como concluído.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status !== "CONFIRMADO") {
      const erro = new Error(`Apenas agendamentos com status 'CONFIRMADO' podem ser marcados como concluídos (status atual: '${agendamento.status}').`);
      erro.status = 400;
      throw erro;
    }

    const dataUpdate = { status: "CONCLUÍDO" };
    if (observacoes) {
      dataUpdate.observacoes = agendamento.observacoes
        ? `${agendamento.observacoes} | ${observacoes.trim()}`
        : observacoes.trim();
    }

    const atualizado = await tx.booking.update({
      where: { id: agendamento.id },
      data: dataUpdate,
      include: { service: true, client: true, transactions: true }
    });

    return formatarAgendamento(atualizado);
  });
}

// Operação Administrativa: Cancelamento (PENDENTE -> CANCELADO ou CONFIRMADO -> CANCELADO) - Libera o horário
async function cancelarAgendamento(id, motivo) {
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    const erro = new Error("ID de agendamento inválido.");
    erro.status = 400;
    throw erro;
  }

  return await prisma.$transaction(async (tx) => {
    const agendamento = await tx.booking.findUnique({
      where: { id: idNum },
      include: { service: true }
    });

    if (!agendamento) {
      const erro = new Error("Agendamento não encontrado.");
      erro.status = 404;
      throw erro;
    }

    if (agendamento.status === "CANCELADO") {
      const erro = new Error("Este agendamento já está cancelado.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status === "RECUSADO") {
      const erro = new Error("Não é possível cancelar um agendamento recusado.");
      erro.status = 400;
      throw erro;
    }

    if (agendamento.status !== "PENDENTE" && agendamento.status !== "CONFIRMADO") {
      const erro = new Error(`Não é possível cancelar um agendamento com status '${agendamento.status}'.`);
      erro.status = 400;
      throw erro;
    }

    const agendamentoCancelado = await tx.booking.update({
      where: { id: agendamento.id },
      data: {
        status: "CANCELADO",
        observacoes: motivo ? (agendamento.observacoes ? `${agendamento.observacoes} | Cancelamento: ${motivo}` : `Cancelamento: ${motivo}`) : agendamento.observacoes
      },
      include: { service: true, client: true, transactions: true }
    });

    return formatarAgendamento(agendamentoCancelado);
  });
}

module.exports = {
  criarAgendamento,
  listarAgendamentos,
  obterAgendamentoPorId,
  aprovarAgendamento,
  recusarAgendamento,
  concluirAgendamento,
  cancelarAgendamento,
  normalizarTelefone
};
