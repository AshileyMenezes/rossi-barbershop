const bookingsService = require("../services/bookings.service");
const availabilityService = require("../services/availability.service");

async function createBooking(req, res) {
  try {
    const { serviceId, date, time, clientName, clientPhone } = req.body;

    // 1. Validação de presença dos campos obrigatórios
    if (!serviceId || !date || !time || !clientName || !clientPhone) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Todos os campos são obrigatórios: serviceId, date, time, clientName e clientPhone."
      });
    }

    // 2. Validação do formato e valor do serviceId
    const idServicoNumerico = Number(serviceId);
    if (!Number.isInteger(idServicoNumerico) || idServicoNumerico <= 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O campo serviceId deve ser um número inteiro positivo correspondente a um serviço válido."
      });
    }

    // 3. Validação real de calendário da data
    if (!availabilityService.validarDataCalendario(date)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "A data informada é inválida ou não existe no calendário. Utilize o formato real YYYY-MM-DD."
      });
    }

    // 4. Validação de intervalo de data permitido (hoje até 4 meses à frente)
    const dataHoje = availabilityService.obterDataAtualLocal();
    const dataLimite = availabilityService.obterDataLimiteAgendamento(4);

    if (date < dataHoje || date > dataLimite) {
      const [aLim, mLim, dLim] = dataLimite.split("-");
      return res.status(400).json({
        sucesso: false,
        mensagem: `A data selecionada deve ser entre hoje e no máximo 4 meses à frente (até ${dLim}/${mLim}/${aLim}).`
      });
    }

    // 5. Validação de formato do horário
    if (typeof time !== "string" || !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O horário deve seguir o padrão HH:mm (exemplo: 14:15)."
      });
    }

    // 6. Validação do nome do cliente (entre 3 e 50 caracteres, apenas letras e espaços)
    const nomeLimpo = typeof clientName === "string" ? clientName.trim() : "";
    if (nomeLimpo.length < 3) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O nome do cliente deve conter pelo menos 3 caracteres."
      });
    }

    if (nomeLimpo.length > 50) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O nome do cliente deve conter no máximo 50 caracteres."
      });
    }

    const regexApenasLetras = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;
    if (!regexApenasLetras.test(nomeLimpo)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O nome deve conter apenas letras e espaços (números e caracteres especiais não são permitidos)."
      });
    }

    // 7. Validação básica do telefone (validação e normalização completas no service)
    if (typeof clientPhone !== "string" || clientPhone.replace(/\D/g, "").length < 10) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Informe um número de telefone celular válido com DDD."
      });
    }

    // Grava com status PENDENTE no PostgreSQL com transação e proteção contra sobreposições
    const agendamento = await bookingsService.criarAgendamento({
      serviceId: idServicoNumerico,
      date,
      time,
      clientName: nomeLimpo,
      clientPhone
    });

    return res.status(201).json({
      sucesso: true,
      mensagem: "Solicitação de agendamento recebida! Aguarde a confirmação da barbearia.",
      dados: agendamento
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro interno ao processar o agendamento."
    });
  }
}

// Operação Administrativa: Listar todos os agendamentos (protegida por autenticação)
async function listBookings(req, res) {
  try {
    const { status, date } = req.query;
    const agendamentos = await bookingsService.listarAgendamentos({ status, date });

    return res.status(200).json({
      sucesso: true,
      total: agendamentos.length,
      dados: agendamentos
    });
  } catch (error) {
    console.error("Erro no listBookings:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao listar agendamentos no banco de dados."
    });
  }
}

// Operação Administrativa: Listar apenas solicitações pendentes (protegida por autenticação)
async function listPendingBookings(req, res) {
  try {
    const agendamentos = await bookingsService.listarAgendamentos({ status: "PENDENTE" });

    return res.status(200).json({
      sucesso: true,
      total: agendamentos.length,
      dados: agendamentos
    });
  } catch (error) {
    console.error("Erro no listPendingBookings:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao listar agendamentos pendentes."
    });
  }
}

// Operação Administrativa: Aprovar solicitação (PENDENTE -> CONFIRMADO)
async function approveBooking(req, res) {
  try {
    const { id } = req.params;
    const agendamento = await bookingsService.aprovarAgendamento(id);

    return res.status(200).json({
      sucesso: true,
      mensagem: "Agendamento aprovado com sucesso!",
      dados: agendamento
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao aprovar o agendamento."
    });
  }
}

// Operação Administrativa: Recusar solicitação (PENDENTE -> RECUSADO)
async function rejectBooking(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const agendamento = await bookingsService.recusarAgendamento(id, motivo);

    return res.status(200).json({
      sucesso: true,
      mensagem: "Agendamento recusado com sucesso. O horário foi liberado.",
      dados: agendamento
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao recusar o agendamento."
    });
  }
}

// Operação Administrativa: Cancelar agendamento (PENDENTE/CONFIRMADO -> CANCELADO)
async function cancelBooking(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body || {};
    const agendamento = await bookingsService.cancelarAgendamento(id, motivo);

    return res.status(200).json({
      sucesso: true,
      mensagem: "Agendamento cancelado com sucesso. O horário foi liberado.",
      dados: agendamento
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao cancelar o agendamento."
    });
  }
}

// Operação Administrativa: Concluir agendamento (CONFIRMADO -> CONCLUÍDO)
async function completeBooking(req, res) {
  try {
    const { id } = req.params;
    const { observacoes } = req.body || {};
    const agendamento = await bookingsService.concluirAgendamento(id, { observacoes });

    return res.status(200).json({
      sucesso: true,
      mensagem: "Atendimento marcado como concluído com sucesso!",
      dados: agendamento
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao concluir o agendamento."
    });
  }
}

module.exports = {
  createBooking,
  listBookings,
  listPendingBookings,
  approveBooking,
  rejectBooking,
  completeBooking,
  cancelBooking
};
