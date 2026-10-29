const dashboardService = require("../services/dashboard.service");

async function login(req, res) {
  try {
    const { password, key, chaveAcesso, chave } = req.body || {};
    const inputToken = (chaveAcesso || password || key || chave || "").trim();
    const adminKey = (process.env.ADMIN_API_KEY || "").trim();

    if (!adminKey) {
      return res.status(500).json({
        sucesso: false,
        mensagem: "ADMIN_API_KEY não configurada no servidor."
      });
    }

    if (!inputToken || inputToken !== adminKey) {
      return res.status(401).json({
        sucesso: false,
        mensagem: "Chave de acesso administrativa inválida."
      });
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: "Autenticação realizada com sucesso!",
      token: adminKey,
      barbeiro: {
        nome: "Rossi Barbershop",
        papel: "Administrador Geral"
      }
    });
  } catch (error) {
    console.error("Erro no login administrativo:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro interno no servidor durante a autenticação."
    });
  }
}

async function verifyAuth(req, res) {
  // Passou pelo middleware authAdmin
  return res.status(200).json({
    sucesso: true,
    autenticado: true,
    barbeiro: {
      nome: "Rossi Barbershop",
      papel: "Administrador Geral"
    }
  });
}

async function getDashboard(req, res) {
  try {
    const dados = await dashboardService.obterDadosDashboard();
    return res.status(200).json({
      sucesso: true,
      dados
    });
  } catch (error) {
    console.error("Erro ao carregar dados do dashboard:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao gerar indicadores do dashboard."
    });
  }
}

module.exports = {
  login,
  verifyAuth,
  getDashboard
};
