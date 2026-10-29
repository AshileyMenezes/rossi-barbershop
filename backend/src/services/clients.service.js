const prisma = require("../lib/prisma");

// Normaliza o telefone para garantir unicidade e consistência no cadastro
function limparTelefone(telefone) {
  if (!telefone) return "";
  const digitos = String(telefone).replace(/\D/g, "");
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
  }
  return telefone.trim();
}

// Obtém ou cria cliente evitando duplicações por número de telefone
async function obterOuCriarCliente({ nome, telefone, email = null }) {
  const telefoneNormalizado = limparTelefone(telefone);
  const nomeLimpo = nome ? nome.trim() : "Cliente";

  let cliente = await prisma.client.findUnique({
    where: { telefone: telefoneNormalizado }
  });

  if (!cliente) {
    cliente = await prisma.client.create({
      data: {
        nome: nomeLimpo,
        telefone: telefoneNormalizado,
        email: email ? email.trim() : null
      }
    });
  } else if (nomeLimpo && nomeLimpo !== "Cliente" && cliente.nome !== nomeLimpo) {
    // Atualiza o nome se o cliente tiver fornecido uma versão mais recente/completa
    cliente = await prisma.client.update({
      where: { id: cliente.id },
      data: { nome: nomeLimpo }
    });
  }

  return cliente;
}

// Lista clientes com contagem de agendamentos, último serviço e total gasto
async function listarClientes({ busca = "" } = {}) {
  const where = {};

  if (busca && busca.trim()) {
    const termo = busca.trim();
    where.OR = [
      { nome: { contains: termo, mode: "insensitive" } },
      { telefone: { contains: termo } }
    ];
  }

  const clientes = await prisma.client.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      bookings: {
        orderBy: [{ date: "desc" }, { time: "desc" }],
        include: { service: true }
      },
      transactions: {
        where: { tipo: "RECEITA", status: "PAGO" }
      }
    }
  });

  return clientes.map(cliente => {
    const totalAgendamentos = cliente.bookings.length;
    const agendamentosConcluidos = cliente.bookings.filter(b => b.status === "CONCLUÍDO");
    const ultimoAgendamento = cliente.bookings[0] || null;

    // Total gasto calculado a partir das transações pagas ou dos serviços concluídos
    const totalGastoTransacoes = cliente.transactions.reduce((acc, t) => acc + Number(t.valor), 0);
    const totalGastoServicos = agendamentosConcluidos.reduce((acc, b) => acc + (b.service ? Number(b.service.preco) : 0), 0);
    const totalGasto = totalGastoTransacoes > 0 ? totalGastoTransacoes : totalGastoServicos;

    return {
      id: cliente.id,
      nome: cliente.nome,
      telefone: cliente.telefone,
      email: cliente.email,
      notas: cliente.notas,
      totalAgendamentos,
      totalConcluidos: agendamentosConcluidos.length,
      totalGasto,
      ultimoAtendimento: ultimoAgendamento ? {
        id: ultimoAgendamento.id,
        data: ultimoAgendamento.date,
        horario: ultimoAgendamento.time,
        servico: ultimoAgendamento.service ? ultimoAgendamento.service.nome : "Serviço",
        status: ultimoAgendamento.status
      } : null,
      criadoEm: cliente.createdAt
    };
  });
}

// Obtém o perfil completo do cliente com histórico detalhado
async function obterDetalhesCliente(id) {
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    const erro = new Error("ID de cliente inválido.");
    erro.status = 400;
    throw erro;
  }

  const cliente = await prisma.client.findUnique({
    where: { id: clienteId },
    include: {
      bookings: {
        orderBy: [{ date: "desc" }, { time: "desc" }],
        include: { service: true, transactions: true }
      },
      transactions: {
        orderBy: { data: "desc" }
      }
    }
  });

  if (!cliente) {
    const erro = new Error("Cliente não encontrado.");
    erro.status = 404;
    throw erro;
  }

  const totalGasto = cliente.transactions
    .filter(t => t.tipo === "RECEITA" && t.status === "PAGO")
    .reduce((acc, t) => acc + Number(t.valor), 0);

  return {
    id: cliente.id,
    nome: cliente.nome,
    telefone: cliente.telefone,
    email: cliente.email,
    notas: cliente.notas,
    totalGasto,
    totalAgendamentos: cliente.bookings.length,
    criadoEm: cliente.createdAt,
    historicoAgendamentos: cliente.bookings.map(b => ({
      id: b.id,
      data: b.date,
      horario: b.time,
      status: b.status,
      servicoId: b.serviceId,
      servicoNome: b.service ? b.service.nome : "Serviço",
      duracao: b.service ? b.service.duracao : 0,
      preco: b.service ? Number(b.service.preco) : 0,
      observacoes: b.observacoes,
      pagamentos: b.transactions.map(t => ({
        id: t.id,
        valor: Number(t.valor),
        metodo: t.metodoPagamento,
        status: t.status,
        data: t.dataPagamento || t.data
      }))
    }))
  };
}

// Atualiza notas e dados cadastrais do cliente
async function atualizarCliente(id, { nome, email, notas }) {
  const clienteId = Number(id);
  if (!Number.isInteger(clienteId) || clienteId <= 0) {
    const erro = new Error("ID de cliente inválido.");
    erro.status = 400;
    throw erro;
  }

  const data = {};
  if (nome && nome.trim()) data.nome = nome.trim();
  if (email !== undefined) data.email = email ? email.trim() : null;
  if (notas !== undefined) data.notas = notas ? notas.trim() : null;

  return await prisma.client.update({
    where: { id: clienteId },
    data
  });
}

// Sincroniza agendamentos existentes que ainda não possuam vínculo com a tabela de clientes
async function sincronizarClientesExistentes() {
  const agendamentosSemCliente = await prisma.booking.findMany({
    where: { clientId: null }
  });

  let vinculados = 0;
  for (const agendamento of agendamentosSemCliente) {
    if (agendamento.clientPhone) {
      const cliente = await obterOuCriarCliente({
        nome: agendamento.clientName,
        telefone: agendamento.clientPhone
      });

      await prisma.booking.update({
        where: { id: agendamento.id },
        data: { clientId: cliente.id }
      });
      vinculados++;
    }
  }

  return { total: agendamentosSemCliente.length, vinculados };
}

module.exports = {
  limparTelefone,
  obterOuCriarCliente,
  listarClientes,
  obterDetalhesCliente,
  atualizarCliente,
  sincronizarClientesExistentes
};
