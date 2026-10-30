require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");

const healthRoutes = require("./routes/health.routes");
const servicesRoutes = require("./routes/services.routes");
const availabilityRoutes = require("./routes/availability.routes");
const bookingsRoutes = require("./routes/bookings.routes");
const adminRoutes = require("./routes/admin.routes");
const clientsRoutes = require("./routes/clients.routes");
const financialRoutes = require("./routes/financial.routes");

const app = express();

// 1. Cabeçalhos de Segurança HTTP com Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Mantém compatibilidade com scripts/estilos locais e SVGs
    crossOriginEmbedderPolicy: false
  })
);

// 2. Configuração restrita de CORS para origens autorizadas
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
  : null;

const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisições de mesma origem, ferramentas de teste ou requisições locais diretas
    if (!origin) return callback(null, true);

    if (allowedOrigins && allowedOrigins.length > 0) {
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Origem bloqueada pela política de segurança CORS."));
    }

    // Validação de ambiente local / desenvolvimento
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const isLocalNetwork = /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin);

    if (isLocalhost || isLocalNetwork) {
      return callback(null, true);
    }

    return callback(new Error("Origem bloqueada pela política de segurança CORS."));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-admin-key"]
};

app.use(cors(corsOptions));

// 3. Limitação estrita do tamanho do payload das requisições (Prevenção de DoS)
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

// 4. Proteção contra exposição de arquivos confidenciais do servidor
app.use((req, res, next) => {
  const caminhoNormalizado = req.path.toLowerCase();
  const arquivosBloqueados = [
    "/package.json",
    "/package-lock.json",
    "/readme.md",
    "/.env",
    "/.gitignore"
  ];

  if (
    arquivosBloqueados.includes(caminhoNormalizado) ||
    caminhoNormalizado.startsWith("/backend") ||
    caminhoNormalizado.startsWith("/.")
  ) {
    return res.status(403).json({
      sucesso: false,
      mensagem: "Acesso proibido."
    });
  }
  next();
});

// 5. Servir arquivos estáticos do frontend com proteção de dotfiles
const rootDir = path.join(__dirname, "../../");
app.use(express.static(rootDir, { dotfiles: "deny", index: "index.html" }));

// 6. Registro de rotas da API
app.use("/api/health", healthRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/financial", financialRoutes);

// 7. Middleware centralizado de tratamento de erros (Evita vazamento de stacktraces)
app.use((err, req, res, next) => {
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      sucesso: false,
      mensagem: err.message
    });
  }

  console.error("Erro interno capturado:", err.message);
  const status = err.status || (err.type === "entity.too.large" ? 413 : 500);
  const mensagem =
    status === 413
      ? "Payload da requisição excede o limite permitido (máximo 50KB)."
      : status === 500
      ? "Erro interno no servidor."
      : err.message;

  return res.status(status).json({
    sucesso: false,
    mensagem
  });
});

module.exports = app;
