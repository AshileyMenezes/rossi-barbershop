const crypto = require("crypto");

// Conjunto em memória para rastrear tokens revogados (logout imediato)
const revokedTokens = new Set();

// Mapa para controle de taxa (Rate Limiting) de tentativas de login por IP
// Formato: ip -> { tentativas: number, bloqueadoAte: number, ultimaTentativa: number }
const loginAttempts = new Map();

const MAX_LOGIN_ATTEMPTS = 5;
const BLOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutos
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000;  // 8 horas de validade

/**
 * Comparação em tempo constante para mitigar Timing Attacks
 */
function timingSafeEqual(strA, strB) {
  if (typeof strA !== "string" || typeof strB !== "string") {
    return false;
  }
  const hashA = crypto.createHash("sha256").update(strA).digest();
  const hashB = crypto.createHash("sha256").update(strB).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Verifica o rate limit de tentativas de login para determinado IP
 */
function checkLoginRateLimit(ip) {
  const agora = Date.now();
  const registro = loginAttempts.get(ip);

  if (!registro) {
    return { permitido: true };
  }

  // Se estiver bloqueado temporariamente
  if (registro.bloqueadoAte && agora < registro.bloqueadoAte) {
    const minutosRestantes = Math.ceil((registro.bloqueadoAte - agora) / 60000);
    return {
      permitido: false,
      mensagem: `Muitas tentativas incorretas de login. Acesso bloqueado temporariamente por mais ${minutosRestantes} minuto(s).`
    };
  }

  // Se o tempo de bloqueio expirou, reinicia contador
  if (registro.bloqueadoAte && agora >= registro.bloqueadoAte) {
    loginAttempts.delete(ip);
    return { permitido: true };
  }

  return { permitido: true };
}

/**
 * Registra falha de login e aplica bloqueio se atingir o limite
 */
function recordLoginFailure(ip) {
  const agora = Date.now();
  const registro = loginAttempts.get(ip) || { tentativas: 0, bloqueadoAte: 0 };
  registro.tentativas += 1;
  registro.ultimaTentativa = agora;

  if (registro.tentativas >= MAX_LOGIN_ATTEMPTS) {
    registro.bloqueadoAte = agora + BLOCK_DURATION_MS;
  }

  loginAttempts.set(ip, registro);
  return registro;
}

/**
 * Limpa registro de tentativas de login após autenticação bem-sucedida
 */
function recordLoginSuccess(ip) {
  loginAttempts.delete(ip);
}

/**
 * Gera um token de sessão criptograficamente seguro e temporário com expiração (TTL)
 */
function generateSessionToken() {
  const adminKey = (process.env.ADMIN_API_KEY || "").trim();
  if (!adminKey) {
    throw new Error("ADMIN_API_KEY não configurada no servidor.");
  }

  const payload = {
    jti: crypto.randomBytes(16).toString("hex"),
    iat: Date.now(),
    exp: Date.now() + TOKEN_TTL_MS,
    role: "ADMIN"
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", adminKey)
    .update(payloadBase64)
    .digest("base64url");

  return `rossi_${payloadBase64}.${signature}`;
}

/**
 * Valida a integridade, assinatura e expiração do token de sessão
 */
function verifySessionToken(token) {
  if (!token || typeof token !== "string" || !token.startsWith("rossi_")) {
    return { valido: false, motivo: "Formato de token inválido." };
  }

  const adminKey = (process.env.ADMIN_API_KEY || "").trim();
  if (!adminKey) {
    return { valido: false, motivo: "Servidor não configurado com ADMIN_API_KEY." };
  }

  const rawToken = token.slice(6); // remove 'rossi_'
  const partes = rawToken.split(".");
  if (partes.length !== 2) {
    return { valido: false, motivo: "Estrutura de token inválida." };
  }

  const [payloadBase64, signature] = partes;

  // Recalcula assinatura esperada
  const expectedSignature = crypto
    .createHmac("sha256", adminKey)
    .update(payloadBase64)
    .digest("base64url");

  if (!timingSafeEqual(signature, expectedSignature)) {
    return { valido: false, motivo: "Assinatura do token inválida." };
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadBase64, "base64url").toString("utf8"));

    // Verifica expiração
    if (!payload.exp || Date.now() > payload.exp) {
      return { valido: false, motivo: "Token de sessão expirado." };
    }

    // Verifica se o token foi revogado via logout
    if (revokedTokens.has(payload.jti)) {
      return { valido: false, motivo: "Sessão encerrada (logout efetuado)." };
    }

    return { valido: true, payload };
  } catch {
    return { valido: false, motivo: "Falha ao decodificar dados da sessão." };
  }
}

/**
 * Invalida o token de sessão (Logout)
 */
function revokeSessionToken(token) {
  if (!token || typeof token !== "string" || !token.startsWith("rossi_")) {
    return false;
  }

  const rawToken = token.slice(6);
  const partes = rawToken.split(".");
  if (partes.length !== 2) return false;

  try {
    const payload = JSON.parse(Buffer.from(partes[0], "base64url").toString("utf8"));
    if (payload.jti) {
      revokedTokens.add(payload.jti);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

module.exports = {
  timingSafeEqual,
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
  generateSessionToken,
  verifySessionToken,
  revokeSessionToken
};
