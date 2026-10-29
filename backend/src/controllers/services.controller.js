const servicesService = require("../services/services.service");

async function getServices(req, res) {
  try {
    const servicos = await servicesService.listarServicos();

    return res.status(200).json({
      sucesso: true,
      total: servicos.length,
      dados: servicos
    });
  } catch (error) {
    console.error("Erro no getServices:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao buscar a lista de serviços no banco de dados."
    });
  }
}

module.exports = {
  getServices
};
