const prisma = require("../lib/prisma");

const NOMES_DIAS = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado"
];

/**
 * Retorna a grade de horários de atendimento conforme o dia da semana:
 * - Domingo (0) e Segunda (1): Fechado
 * - Terça a Quinta (2, 3, 4): 08:45 às 12:00 e 13:30 às 19:30
 * - Sexta (5): 08:00 às 12:00 e 13:30 às 19:30
 * - Sábado (6): 08:00 às 12:00 e 12:45 às 15:00
 */
function obterHorariosDoDia(diaSemana) {
  // Domingo (0) e Segunda (1): Fechados
  if (diaSemana === 0 || diaSemana === 1) {
    return [];
  }

  // Terça (2), Quarta (3) e Quinta (4): 08:45 às 12:00 e 13:30 às 19:30
  if (diaSemana >= 2 && diaSemana <= 4) {
    return [
      "08:45", "09:30", "10:15", "11:00",
      "13:30", "14:15", "15:00", "15:45", "16:30", "17:15", "18:00", "18:45"
    ];
  }

  // Sexta (5): 08:00 às 12:00 e 13:30 às 19:30
  if (diaSemana === 5) {
    return [
      "08:00", "08:45", "09:30", "10:15", "11:00",
      "13:30", "14:15", "15:00", "15:45", "16:30", "17:15", "18:00", "18:45"
    ];
  }

  // Sábado (6): 08:00 às 12:00 e 12:45 às 15:00
  if (diaSemana === 6) {
    return [
      "08:00", "08:45", "09:30", "10:15", "11:00",
      "12:45", "13:30", "14:15"
    ];
  }

  return [];
}

function obterDataAtualLocal() {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function obterHoraAtualLocal() {
  const agora = new Date();
  const horas = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

/**
 * Retorna a data máxima permitida para agendamento (hoje + 4 meses).
 * Isso libera os dias gradualmente conforme o tempo avança.
 */
function obterDataLimiteAgendamento(meses = 4) {
  const agora = new Date();
  const limite = new Date(agora.getFullYear(), agora.getMonth() + meses, agora.getDate());
  const ano = limite.getFullYear();
  const mes = String(limite.getMonth() + 1).padStart(2, "0");
  const dia = String(limite.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

async function consultarDisponibilidade(dataString) {
  const dataHoje = obterDataAtualLocal();
  const dataLimite = obterDataLimiteAgendamento(4);
  const horaHoje = obterHoraAtualLocal();

  const [ano, mes, dia] = dataString.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const diaSemana = data.getDay();
  const diaSemanaNome = NOMES_DIAS[diaSemana] || "";

  // 1. Bloqueia datas passadas
  if (dataString < dataHoje) {
    return {
      disponivel: false,
      diaSemana: diaSemanaNome,
      mensagem: "Não é possível consultar ou agendar para datas que já passaram.",
      horarios: []
    };
  }

  // 1.1 Bloqueia datas além de 4 meses no futuro (ex: ano 2050)
  if (dataString > dataLimite) {
    const [aLim, mLim, dLim] = dataLimite.split("-");
    return {
      disponivel: false,
      diaSemana: diaSemanaNome,
      mensagem: `Agendamentos são permitidos para no máximo 4 meses à frente (disponível até ${dLim}/${mLim}/${aLim}).`,
      horarios: []
    };
  }

  // 2. Domingo = 0 e Segunda = 1: Fechado
  if (diaSemana === 0 || diaSemana === 1) {
    return {
      disponivel: false,
      diaSemana: diaSemanaNome,
      mensagem: "A barbearia não abre aos domingos e segundas-feiras.",
      horarios: []
    };
  }

  const horariosExpediente = obterHorariosDoDia(diaSemana);

  // 3. Busca no PostgreSQL todos os agendamentos já confirmados para esta data
  const agendamentosConfirmados = await prisma.booking.findMany({
    where: {
      date: dataString,
      status: "CONFIRMADO"
    },
    select: {
      time: true
    }
  });

  const horariosOcupados = agendamentosConfirmados.map(a => a.time);

  // 4. Filtra horários que já estão reservados
  let horariosLivres = horariosExpediente.filter(
    horario => !horariosOcupados.includes(horario)
  );

  // 5. Se a data for HOJE, filtra os horários que já ultrapassaram o horário atual!
  if (dataString === dataHoje) {
    horariosLivres = horariosLivres.filter(horario => horario > horaHoje);
  }

  const disponivel = horariosLivres.length > 0;
  let mensagem = "Horários disponíveis encontrados.";

  if (!disponivel) {
    if (dataString === dataHoje) {
      mensagem = "O expediente de hoje já se encerrou ou todos os horários já passaram. Por favor, escolha outra data.";
    } else {
      mensagem = "Não há mais horários disponíveis para esta data.";
    }
  }

  return {
    disponivel,
    diaSemana: diaSemanaNome,
    mensagem,
    horarios: horariosLivres
  };
}

module.exports = {
  consultarDisponibilidade,
  obterHorariosDoDia,
  obterDataAtualLocal,
  obterHoraAtualLocal,
  obterDataLimiteAgendamento,
  NOMES_DIAS
};
