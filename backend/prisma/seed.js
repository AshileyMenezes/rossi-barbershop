const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const servicosIniciais = [
  { id: 1, nome: "Acabamento (Pezinho)", duracao: 15, preco: 20.0, ativo: true },
  { id: 2, nome: "Alisamento", duracao: 20, preco: 30.0, ativo: true },
  { id: 3, nome: "Barba", duracao: 45, preco: 45.0, ativo: true },
  { id: 4, nome: "Cabelo + Barba", duracao: 60, preco: 85.0, ativo: true },
  { id: 5, nome: "Corte de Cabelo", duracao: 45, preco: 45.0, ativo: true },
  { id: 6, nome: "Depilação Nasal", duracao: 15, preco: 20.0, ativo: true },
  { id: 7, nome: "Luzes", duracao: 60, preco: 120.0, ativo: true },
  { id: 8, nome: "Penteado", duracao: 30, preco: 20.0, ativo: true },
  { id: 9, nome: "Pigmentação", duracao: 15, preco: 25.0, ativo: true },
  { id: 10, nome: "Platinado", duracao: 80, preco: 200.0, ativo: true }
];

async function main() {
  console.log("🌱 Populando o banco de dados com os serviços da Rossi Barbershop...");

  for (const servico of servicosIniciais) {
    await prisma.service.upsert({
      where: { id: servico.id },
      update: {
        nome: servico.nome,
        duracao: servico.duracao,
        preco: servico.preco,
        ativo: servico.ativo
      },
      create: {
        id: servico.id,
        nome: servico.nome,
        duracao: servico.duracao,
        preco: servico.preco,
        ativo: servico.ativo
      }
    });
  }

  console.log("✅ 10 serviços cadastrados com sucesso no banco de dados!");
}

main()
  .catch(erro => {
    console.error("❌ Erro ao popular o banco:", erro);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
