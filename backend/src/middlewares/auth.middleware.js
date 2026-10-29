// Middleware de autenticação para operações administrativas da Rossi Barbershop
// Protege a visualização de dados sensíveis de clientes e operações de aprovação/recusa/cancelamento.

function authAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.error("ERRO DE SEGURANÇA: ADMIN_API_KEY não configurada no ambiente.");
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro de configuração do servidor: autenticação administrativa indisponível."
    });
  }

  // Permite autenticação via header 'x-admin-key' ou 'Authorization: Bearer <token>'
  const headerKey = req.headers["x-admin-key"];
  const authHeader = req.headers["authorization"];
  let token = null;

  if (headerKey && typeof headerKey === "string") {
    token = headerKey.trim();
  } else if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token || token !== adminKey) {
    return res.status(401).json({
      sucesso: false,
      mensagem: "Acesso não autorizado. Chave de autenticação administrativa ausente ou inválida."
    });
  }

  next();
}

module.exports = {
  authAdmin
};
