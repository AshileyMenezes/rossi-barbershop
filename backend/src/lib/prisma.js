const { PrismaClient } = require("@prisma/client");

// Instância única (Singleton) do Prisma Client para toda a aplicação
const prisma = new PrismaClient();

module.exports = prisma;
