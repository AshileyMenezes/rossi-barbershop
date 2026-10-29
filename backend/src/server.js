const app = require("./app");

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log("API disponível na rede local");
  console.log(`🌐 Rede local: http://192.168.0.218:${PORT}`);
  console.log(`🔍 Teste de integridade disponível em: http://192.168.0.218:${PORT}/api/health`);
});
