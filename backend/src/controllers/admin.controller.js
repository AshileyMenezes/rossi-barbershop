const dashboardService = require("../services/dashboard.service");
const {
  timingSafeEqual,
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
  generateSessionToken,
  revokeSessionToken
} = require("../lib/auth");

async function login(req, res) {
  try {
    const forwarded = req.headers["x-forwarded-for"];
    const clientIp = (forwarded ? forwarded.split(",")[0].trim() : null) || req.ip || req.socket?.remoteAddress || "127.0.0.1";

    // 1. Verificação de Rate Limit (Proteção contra Brute-Force)
    const rateCheck = checkLoginRateLimit(clientIp);
    if (!rateCheck.permitido) {
      return res.status(429).json({
        sucesso: false,
        mensagem: rateCheck.mensagem
      });
    }

    const { password, key, chaveAcesso, chave } = req.body || {};
    const inputToken = (chaveAcesso || password || key || chave || "").trim();
    const adminKey = (process.env.ADMIN_API_KEY || "").trim();

    if (!adminKey) {
      return res.status(500).json({
        sucesso: false,
        mensagem: "ADMIN_API_KEY não configurada no servidor."
      });
    }

    // 2. Comparação segura de credenciais em tempo constante (Timing-safe)
    if (!inputToken || !timingSafeEqual(inputToken, adminKey)) {
      recordLoginFailure(clientIp);
      return res.status(401).json({
        sucesso: false,
        mensagem: "Chave de acesso administrativa inválida."
      });
    }

    // 3. Sucesso: Reinicia contador de falhas e gera token temporário assinado
    recordLoginSuccess(clientIp);
    const sessionToken = generateSessionToken();

    return res.status(200).json({
      sucesso: true,
      mensagem: "Autenticação realizada com sucesso!",
      token: sessionToken,
      expiraEmHoras: 8,
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
    exp: req.adminSession?.exp,
    barbeiro: {
      nome: "Rossi Barbershop",
      papel: "Administrador Geral"
    }
  });
}

async function logout(req, res) {
  try {
    const headerKey = req.headers["x-admin-key"];
    const authHeader = req.headers["authorization"];
    const token = (headerKey || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null) || "").trim();

    if (token) {
      revokeSessionToken(token);
    }

    return res.status(200).json({
      sucesso: true,
      mensagem: "Sessão encerrada com sucesso."
    });
  } catch (error) {
    console.error("Erro no logout:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao processar encerramento de sessão."
    });
  }
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
  logout,
  getDashboard
};
