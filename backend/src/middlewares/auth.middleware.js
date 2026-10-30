// Middleware de autenticação para operações administrativas da Rossi Barbershop
// Protege a visualização de dados sensíveis de clientes e operações de aprovação/recusa/cancelamento.

const { verifySessionToken, timingSafeEqual } = require("../lib/auth");

function authAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.error("ERRO DE SEGURANÇA: ADMIN_API_KEY não configurada no ambiente.");
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro de configuração do servidor: autenticação administrativa indisponível."
    });
  }

  // Extrai token do header 'x-admin-key' ou 'Authorization: Bearer <token>'
  const headerKey = req.headers["x-admin-key"];
  const authHeader = req.headers["authorization"];
  let token = null;

  if (headerKey && typeof headerKey === "string") {
    token = headerKey.trim();
  } else if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    return res.status(401).json({
      sucesso: false,
      mensagem: "Acesso não autorizado. Chave de autenticação administrativa ausente ou inválida."
    });
  }

  // 1. Verifica se é um Token de Sessão temporário criptográfico (rossi_...)
  if (token.startsWith("rossi_")) {
    const validacao = verifySessionToken(token);
    if (!validacao.valido) {
      return res.status(401).json({
        sucesso: false,
        mensagem: `Acesso não autorizado: ${validacao.motivo}`
      });
    }
    req.adminSession = validacao.payload;
    return next();
  }

  // 2. Fallback de integração: Permite chamadas com a ADMIN_API_KEY mestra usando comparação em tempo constante
  if (timingSafeEqual(token, adminKey)) {
    req.adminSession = { role: "ADMIN", master: true };
    return next();
  }

  return res.status(401).json({
    sucesso: false,
    mensagem: "Acesso não autorizado. Chave de autenticação administrativa ausente ou inválida."
  });
}

module.exports = {
  authAdmin
};
