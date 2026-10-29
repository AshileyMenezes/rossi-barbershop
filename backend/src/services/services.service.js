const prisma = require("../lib/prisma");

async function listarServicos() {
  // Consulta diretamente a tabela 'services' do banco de dados PostgreSQL
  const servicos = await prisma.service.findMany({
    where: {
      ativo: true
    },
    orderBy: {
      id: "asc"
    }
  });

  // Converte o tipo Decimal do PostgreSQL para Number para envio em JSON
  return servicos.map(servico => ({
    ...servico,
    preco: Number(servico.preco)
  }));
}

module.exports = {
  listarServicos
};
