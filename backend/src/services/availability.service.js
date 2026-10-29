
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

// Horários reais de funcionamento da barbearia.
function obterHorariosDoDia(diaSemana) {
  if (diaSemana === 0 || diaSemana === 1) {
    return [];
  }

  if (diaSemana >= 2 && diaSemana <= 4) {
    return [
      "08:45", "09:30", "10:15", "11:00",
      "13:30", "14:15", "15:00", "15:45",
      "16:30", "17:15", "18:00", "18:45"
    ];
  }

  if (diaSemana === 5) {
    return [
      "08:00", "08:45", "09:30", "10:15",
      "11:00", "13:30", "14:15", "15:00",
      "15:45", "16:30", "17:15", "18:00", "18:45"
    ];
  }

  if (diaSemana === 6) {
    return [
      "08:00", "08:45", "09:30", "10:15",
      "11:00", "12:45", "13:30", "14:15"
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

function obterDataLimiteAgendamento(meses = 4) {
  const agora = new Date();
  const limite = new Date(
    agora.getFullYear(),
    agora.getMonth() + meses,
    agora.getDate()
  );

  const ano = limite.getFullYear();
  const mes = String(limite.getMonth() + 1).padStart(2, "0");
  const dia = String(limite.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function minutosDoHorario(horario) {
  const [horas, minutos] = horario.split(":").map(Number);
  return horas * 60 + minutos;
}

function horarioDentroDoExpediente(
  diaSemana,
  inicio,
  fim
) {
  let intervalos;

  if (diaSemana >= 2 && diaSemana <= 4) {
    intervalos = [[525, 720], [810, 1170]];
  } else if (diaSemana === 5) {
    intervalos = [[480, 720], [810, 1170]];
  } else if (diaSemana === 6) {
    intervalos = [[480, 720], [765, 900]];
  } else {
    return false;
  }

  return intervalos.some(
    ([abertura, fechamento]) =>
      inicio >= abertura && fim <= fechamento
  );
}

function validarDataCalendario(dataString) {
  if (typeof dataString !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dataString)) {
    return false;
  }
  const [ano, mes, dia] = dataString.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  return (
    Number.isFinite(data.getTime()) &&
    data.getFullYear() === ano &&
    data.getMonth() === mes - 1 &&
    data.getDate() === dia
  );
}

async function consultarDisponibilidade(dataString, serviceId) {
  const dataHoje = obterDataAtualLocal();
  const dataLimite = obterDataLimiteAgendamento(4);
  const horaHoje = obterHoraAtualLocal();

  if (!validarDataCalendario(dataString)) {
    return {
      disponivel: false,
      diaSemana: "",
      mensagem: "Data inválida ou não existente no calendário (formato esperado: YYYY-MM-DD).",
      horarios: []
    };
  }

  const [ano, mes, dia] = dataString.split("-").map(Number);
  const data = new Date(ano, mes - 1, dia);
  const diaSemana = data.getDay();
  const diaSemanaNome = NOMES_DIAS[diaSemana] || "";

  if (dataString < dataHoje) {
    return {
      disponivel: false,
      diaSemana: diaSemanaNome,
      mensagem: "Não é possível consultar ou agendar para datas passadas.",
      horarios: []
    };
  }

  if (dataString > dataLimite) {
    return {
      disponivel: false,
      diaSemana: diaSemanaNome,
      mensagem: "A data ultrapassa o limite de 4 meses para agendamento.",
      horarios: []
    };
  }

  if (diaSemana === 0 || diaSemana === 1) {
    return {
      disponivel: false,
      diaSemana: diaSemanaNome,
      mensagem: "A barbearia não abre aos domingos e segundas-feiras.",
      horarios: []
    };
  }

  const servico = await prisma.service.findFirst({
    where: {
      id: Number(serviceId),
      ativo: true
    },
    select: {
      id: true,
      duracao: true
    }
  });

  if (!servico) {
    return {
      disponivel: false,
      diaSemana: diaSemanaNome,
      mensagem: "Serviço não encontrado ou inativo.",
      horarios: []
    };
  }

  const agendamentos = await prisma.booking.findMany({
    where: {
      date: dataString,
      status: {
        in: ["PENDENTE", "CONFIRMADO", "CONCLUÍDO"]
      }
    },
    select: {
      time: true,
      service: {
        select: {
          duracao: true
        }
      }
    }
  });

  const duracaoNovo = servico.duracao;

  const horariosLivres = obterHorariosDoDia(diaSemana).filter(
    horario => {
      const inicio = minutosDoHorario(horario);
      const fim = inicio + duracaoNovo;

      if (
        dataString === dataHoje &&
        horario <= horaHoje
      ) {
        return false;
      }

      if (!horarioDentroDoExpediente(diaSemana, inicio, fim)) {
        return false;
      }

      const temSobreposicao = agendamentos.some(agendamento => {
        const inicioExistente = minutosDoHorario(agendamento.time);
        const fimExistente =
          inicioExistente + agendamento.service.duracao;

        return inicio < fimExistente && fim > inicioExistente;
      });

      return !temSobreposicao;
    }
  );

  const disponivel = horariosLivres.length > 0;

  return {
    disponivel,
    diaSemana: diaSemanaNome,
    mensagem: disponivel
      ? "Horários disponíveis encontrados."
      : "Não há mais horários disponíveis para esta data.",
    horarios: horariosLivres
  };
}

module.exports = {
  consultarDisponibilidade,
  obterHorariosDoDia,
  obterDataAtualLocal,
  obterHoraAtualLocal,
  obterDataLimiteAgendamento,
  validarDataCalendario,
  NOMES_DIAS
};
