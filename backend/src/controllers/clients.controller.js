const clientsService = require("../services/clients.service");

async function listClients(req, res) {
  try {
    const { busca } = req.query;
    const clientes = await clientsService.listarClientes({ busca });

    return res.status(200).json({
      sucesso: true,
      total: clientes.length,
      dados: clientes
    });
  } catch (error) {
    console.error("Erro no listClients:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao listar clientes no banco de dados."
    });
  }
}

async function getClientDetails(req, res) {
  try {
    const { id } = req.params;
    const cliente = await clientsService.obterDetalhesCliente(id);

    return res.status(200).json({
      sucesso: true,
      dados: cliente
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao consultar histórico do cliente."
    });
  }
}

async function updateClient(req, res) {
  try {
    const { id } = req.params;
    const { nome, email, notas } = req.body;
    const cliente = await clientsService.atualizarCliente(id, { nome, email, notas });

    return res.status(200).json({
      sucesso: true,
      mensagem: "Dados do cliente atualizados com sucesso!",
      dados: cliente
    });
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      sucesso: false,
      mensagem: error.message || "Erro ao atualizar dados do cliente."
    });
  }
}

async function syncClients(req, res) {
  try {
    const resultado = await clientsService.sincronizarClientesExistentes();
    return res.status(200).json({
      sucesso: true,
      mensagem: "Sincronização de clientes executada com sucesso!",
      dados: resultado
    });
  } catch (error) {
    console.error("Erro no syncClients:", error);
    return res.status(500).json({
      sucesso: false,
      mensagem: "Erro ao sincronizar clientes históricos."
    });
  }
}

module.exports = {
  listClients,
  getClientDetails,
  updateClient,
  syncClients
};
