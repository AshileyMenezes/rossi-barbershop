const availabilityService = require("../services/availability.service");

async function getAvailability(req, res) {
  try {
    const { date, serviceId } = req.query;

    if (!date) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O parâmetro 'date' é obrigatório no formato YYYY-MM-DD (exemplo: ?date=2026-10-20)."
      });
    }
    if (!serviceId || !Number.isInteger(Number(serviceId)) || Number(serviceId) <= 0) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "O parâmetro 'serviceId' é obrigatório e deve ser um ID válido."
      });
    }

    if (!availabilityService.validarDataCalendario(date)) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Data inválida ou não existente no calendário. Utilize o formato real YYYY-MM-DD."
      });
    }

    const dataHojeLocal = availabilityService.obterDataAtualLocal();
    if (date < dataHojeLocal) {
      return res.status(400).json({
        sucesso: false,
        mensagem: "Não é possível consultar disponibilidade para datas passadas."
      });
    }

    // Consulta disponibilidade filtrando reservas reais no banco de dados
    const resultado = await availabilityService.consultarDisponibilidade(
      date,
      Number(serviceId)
    );

    return res.status(200).json({
      sucesso: true,
      data: date,
      ...resultado
    });
  } catch (error) {
    console.error("Erro no getAvailability:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao consultar disponibilidade de horários no banco de dados."
    });
  }
}

module.exports = {
  getAvailability
};
