const prisma = require("../lib/prisma");
const availabilityService = require("./availability.service");

async function criarAgendamento({ serviceId, date, time, clientName, clientPhone }) {
  // 0. Validação de integridade do nome (Regra 3: Source-Level Security)
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

  // 1. Busca o serviço oficial no PostgreSQL para recuperar preço e duração reais
  const servico = await prisma.service.findFirst({
    where: {
      id: Number(serviceId),
      ativo: true
    }
  });

  if (!servico) {
    const erro = new Error("O serviço selecionado não existe ou não está ativo.");
    erro.status = 404;
    throw erro;
  }

  // 2. Valida se a data ou horário já passaram ou ultrapassam o limite de 4 meses
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

  // 3. Verificação prévia no banco de dados
  const agendamentoExistente = await prisma.booking.findFirst({
    where: {
      date,
      time,
      status: "CONFIRMADO"
    }
  });

  if (agendamentoExistente) {
    const erro = new Error("Desculpe, este horário acabou de ser reservado por outro cliente.");
    erro.status = 409;
    throw erro;
  }

  // 4. Criação no PostgreSQL com proteção por constraint única no banco (@@unique([date, time]))
  try {
    const novoAgendamento = await prisma.booking.create({
      data: {
        clientName: clientName.trim(),
        clientPhone: clientPhone.trim(),
        serviceId: servico.id,
        date,
        time,
        status: "CONFIRMADO"
      },
      include: {
        service: true
      }
    });

    return {
      id: novoAgendamento.id,
      cliente: novoAgendamento.clientName,
      telefone: novoAgendamento.clientPhone,
      servicoId: novoAgendamento.service.id,
      servicoNome: novoAgendamento.service.nome,
      duracao: novoAgendamento.service.duracao,
      preco: Number(novoAgendamento.service.preco),
      data: novoAgendamento.date,
      horario: novoAgendamento.time,
      status: novoAgendamento.status,
      criadoEm: novoAgendamento.createdAt
    };
  } catch (err) {
    // Código P2002 do Prisma: violação de chave única no PostgreSQL
    if (err.code === "P2002") {
      const erroConflito = new Error("Desculpe, este horário acabou de ser reservado por outro cliente.");
      erroConflito.status = 409;
      throw erroConflito;
    }
    throw err;
  }
}

async function listarAgendamentos() {
  const agendamentos = await prisma.booking.findMany({
    orderBy: [
      { date: "asc" },
      { time: "asc" }
    ],
    include: {
      service: true
    }
  });

  return agendamentos.map(a => ({
    id: a.id,
    cliente: a.clientName,
    telefone: a.clientPhone,
    servicoId: a.service.id,
    servicoNome: a.service.nome,
    duracao: a.service.duracao,
    preco: Number(a.service.preco),
    data: a.date,
    horario: a.time,
    status: a.status,
    criadoEm: a.createdAt
  }));
}

module.exports = {
  criarAgendamento,
  listarAgendamentos
};
