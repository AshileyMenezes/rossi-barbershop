/**
 * ============================================================
 * ROSSI BARBERSHOP — PAINEL ADMINISTRATIVO & FINANCEIRO
 * Lógica Completa do Frontend da Área do Barbeiro
 * ============================================================
 */

(function () {
  "use strict";

  // URL base dinâmica: se aberto pelo Live Server (porta 5500) ou direto pelo arquivo, aponta para o IP da máquina
  const API_BASE = (window.location.protocol === "http:" || window.location.protocol === "https:") && window.location.port === "3000"
    ? "/api"
    : (window.location.hostname && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1")
      ? `http://${window.location.hostname}:3000/api`
      : "http://192.168.0.218:3000/api";


  // Estado da Aplicação
  const state = {
    token: sessionStorage.getItem("rossi_admin_token") || "",
    abaAtiva: "dashboard",
    filtroStatusAgendamentos: "PENDENTE",
    periodoFinanceiro: "mes",
    dataCalendarioAtual: new Date(),
    visaoCalendario: "dia",
    dadosDashboard: null,
    dadosAgendamentos: [],
    dadosClientes: [],
    dadosFinanceiro: null,
    agendamentoEmPagamento: null,
    clienteEmVisualizacao: null
  };

  // Helper de desempacotamento de respostas da API ({ sucesso: true, dados: ... })
  function unwrap(json) {
    if (!json) return {};
    return json.dados !== undefined ? json.dados : json;
  }

  // Helper de cabeçalho autenticado
  function getHeaders() {
    return {
      "Content-Type": "application/json",
      "x-admin-key": state.token,
      "Authorization": `Bearer ${state.token}`
    };
  }

  // Utilitário de formatação de moeda brasileira (R$)
  function formatarMoeda(valor) {
    const num = Number(valor) || 0;
    return num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  // Função utilitária estrita para sanitização contra injeções XSS (Cross-Site Scripting)
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Utilitário de formatação de data e hora
  function formatarDataHora(dataString, horarioString) {
    if (!dataString) return "-";
    if (horarioString) {
      const partes = dataString.split("T")[0].split("-");
      if (partes.length === 3) {
        return `${partes[2]}/${partes[1]}/${partes[0]} às ${horarioString}`;
      }
      return `${dataString} às ${horarioString}`;
    }
    const data = new Date(dataString);
    if (isNaN(data.getTime())) return dataString;
    return data.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function formatarData(dataString) {
    if (!dataString) return "-";
    const partes = String(dataString).split("T")[0].split("-");
    if (partes.length === 3) {
      return `${partes[2]}/${partes[1]}/${partes[0]}`;
    }
    const data = new Date(dataString);
    if (isNaN(data.getTime())) return dataString;
    return data.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  }

  // ============================================================
  // 1. INICIALIZAÇÃO E AUTENTICAÇÃO
  // ============================================================
  document.addEventListener("DOMContentLoaded", () => {
    configurarEventosGlobais();
    verificarAutenticacao();
  });

  function verificarAutenticacao() {
    if (state.token) {
      fetch(`${API_BASE}/admin/verify`, { headers: getHeaders() })
        .then(res => {
          if (res.ok) {
            exibirPainel();
          } else {
            exibirLogin();
          }
        })
        .catch(() => {
          // Bloqueio rigoroso: falhas de rede ou de verificação NUNCA abrem o painel
          exibirLogin();
        });
    } else {
      exibirLogin();
    }
  }

  function exibirLogin() {
    document.getElementById("modal-login").hidden = false;
    document.getElementById("painel-principal").hidden = true;
    state.token = "";
    sessionStorage.removeItem("rossi_admin_token");
    state.dadosDashboard = null;
    state.dadosAgendamentos = [];
    state.dadosClientes = [];
    state.dadosFinanceiro = null;
  }

  function exibirPainel() {
    document.getElementById("modal-login").hidden = true;
    document.getElementById("painel-principal").hidden = false;
    carregarDadosPainel();
  }

  function configurarEventosGlobais() {
    // Form de Login
    const formLogin = document.getElementById("form-login");
    if (formLogin) {
      formLogin.addEventListener("submit", async (e) => {
        e.preventDefault();
        const inputChave = document.getElementById("chave-acesso");
        const erroLogin = document.getElementById("erro-login");
        const btnEntrar = document.getElementById("btn-entrar");

        const chave = inputChave.value.trim();
        if (!chave) return;

        btnEntrar.disabled = true;
        btnEntrar.textContent = "VERIFICANDO...";
        erroLogin.hidden = true;

        try {
          const res = await fetch(`${API_BASE}/admin/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chaveAcesso: chave })
          });

          const data = await res.json();
          if (res.ok && data.token) {
            state.token = data.token;
            sessionStorage.setItem("rossi_admin_token", data.token);
            exibirPainel();
          } else {
            erroLogin.textContent = data.mensagem || data.erro || "Chave administrativa incorreta.";
            erroLogin.hidden = false;
          }
        } catch (err) {
          console.error("Erro de conexão no login:", err);
          erroLogin.textContent = "Não foi possível conectar ao backend (http://localhost:3000). Verifique se o servidor está rodando.";
          erroLogin.hidden = false;
        } finally {
          btnEntrar.disabled = false;
          btnEntrar.textContent = "ACESSAR PAINEL";
        }
      });
    }

    // Logout com revogação no servidor
    const btnLogout = document.getElementById("btn-logout");
    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        if (confirm("Deseja realmente sair da Área do Barbeiro?")) {
          try {
            await fetch(`${API_BASE}/admin/logout`, {
              method: "POST",
              headers: getHeaders()
            });
          } catch (e) {
            console.warn("Falha ao comunicar logout ao servidor:", e);
          }
          exibirLogin();
        }
      });
    }

    // Botão Recarregar Topbar
    const btnRecarregar = document.getElementById("btn-recarregar");
    if (btnRecarregar) {
      btnRecarregar.addEventListener("click", () => {
        carregarDadosPainel();
      });
    }

    // Menu Mobile
    const btnMenuMobile = document.getElementById("btn-menu-mobile");
    const btnFecharSidebar = document.getElementById("btn-fechar-sidebar");
    const sidebar = document.getElementById("sidebar");

    if (btnMenuMobile && sidebar) {
      btnMenuMobile.addEventListener("click", () => {
        sidebar.classList.add("aberto");
      });
    }
    if (btnFecharSidebar && sidebar) {
      btnFecharSidebar.addEventListener("click", () => {
        sidebar.classList.remove("aberto");
      });
    }

    // Navegação pelas abas da Sidebar
    document.querySelectorAll(".nav-item").forEach(btn => {
      btn.addEventListener("click", () => {
        const aba = btn.getAttribute("data-aba");
        navegarAba(aba);
        if (sidebar) sidebar.classList.remove("aberto");
      });
    });

    // Sub-abas de Agendamentos
    document.querySelectorAll(".sub-aba-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".sub-aba-btn").forEach(b => b.classList.remove("ativo"));
        btn.classList.add("ativo");
        state.filtroStatusAgendamentos = btn.getAttribute("data-filtro-status");
        carregarAgendamentos();
      });
    });

    // Busca de agendamentos
    const buscaAgendamento = document.getElementById("busca-agendamento");
    if (buscaAgendamento) {
      buscaAgendamento.addEventListener("input", debounce(() => carregarAgendamentos(), 300));
    }

    const filtroData = document.getElementById("filtro-data-agendamento");
    if (filtroData) {
      filtroData.addEventListener("change", () => carregarAgendamentos());
    }

    const btnLimparFiltros = document.getElementById("btn-limpar-filtros-agendamento");
    if (btnLimparFiltros) {
      btnLimparFiltros.addEventListener("click", () => {
        if (buscaAgendamento) buscaAgendamento.value = "";
        if (filtroData) filtroData.value = "";
        carregarAgendamentos();
      });
    }

    // Busca de clientes
    const buscaClientes = document.getElementById("busca-clientes");
    if (buscaClientes) {
      buscaClientes.addEventListener("input", debounce(() => carregarClientes(), 300));
    }

    // Filtros de Período Financeiro
    document.querySelectorAll(".btn-periodo").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".btn-periodo").forEach(b => b.classList.remove("ativo"));
        btn.classList.add("ativo");
        state.periodoFinanceiro = btn.getAttribute("data-periodo");
        carregarFinanceiro();
      });
    });

    // Filtros da tabela financeira
    const filtroTipoTrans = document.getElementById("filtro-tipo-transacao");
    const filtroStatusTrans = document.getElementById("filtro-status-transacao");
    if (filtroTipoTrans) filtroTipoTrans.addEventListener("change", () => renderizarTabelaTransacoes());
    if (filtroStatusTrans) filtroStatusTrans.addEventListener("change", () => renderizarTabelaTransacoes());

    // Botões de Modal de Transação Manual
    const btnNovaReceita = document.getElementById("btn-nova-receita");
    const btnNovaDespesa = document.getElementById("btn-nova-despesa");
    if (btnNovaReceita) btnNovaReceita.addEventListener("click", () => abrirModalTransacao("RECEITA"));
    if (btnNovaDespesa) btnNovaDespesa.addEventListener("click", () => abrirModalTransacao("DESPESA"));

    // Salvar Transação Manual
    const btnSalvarTransacao = document.getElementById("btn-salvar-transacao");
    if (btnSalvarTransacao) {
      btnSalvarTransacao.addEventListener("click", salvarTransacaoManual);
    }

    // Modal Split Payment: Adicionar Linha
    const btnAddLinhaPagamento = document.getElementById("btn-adicionar-linha-pagamento");
    if (btnAddLinhaPagamento) {
      btnAddLinhaPagamento.addEventListener("click", () => adicionarLinhaPagamento());
    }

    // Confirmar Pagamento do Agendamento
    const btnConfirmarPagamento = document.getElementById("btn-confirmar-pagamento-agendamento");
    if (btnConfirmarPagamento) {
      btnConfirmarPagamento.addEventListener("click", confirmarPagamentoAgendamento);
    }

    // Calendário: Navegação e Visões
    const calBtnAnt = document.getElementById("cal-btn-ant");
    const calBtnProx = document.getElementById("cal-btn-prox");
    const calBtnHoje = document.getElementById("cal-btn-hoje");

    if (calBtnAnt) calBtnAnt.addEventListener("click", () => navegarCalendario(-1));
    if (calBtnProx) calBtnProx.addEventListener("click", () => navegarCalendario(1));
    if (calBtnHoje) calBtnHoje.addEventListener("click", () => {
      state.dataCalendarioAtual = new Date();
      carregarCalendario();
    });

    document.querySelectorAll(".visao-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".visao-btn").forEach(b => b.classList.remove("ativo"));
        btn.classList.add("ativo");
        state.visaoCalendario = btn.getAttribute("data-visao");
        carregarCalendario();
      });
    });

    // Salvar Notas do Cliente
    const btnSalvarNotas = document.getElementById("btn-salvar-notas-cliente");
    if (btnSalvarNotas) {
      btnSalvarNotas.addEventListener("click", salvarNotasCliente);
    }
  }

  // ============================================================
  // 2. NAVEGAÇÃO ENTRE ABAS
  // ============================================================
  window.navegarAba = function (abaNome, filtroEspecifico) {
    state.abaAtiva = abaNome;

    // Atualizar sidebar
    document.querySelectorAll(".nav-item").forEach(item => {
      if (item.getAttribute("data-aba") === abaNome) {
        item.classList.add("ativo");
      } else {
        item.classList.remove("ativo");
      }
    });

    // Ocultar todas as abas e mostrar a ativa
    document.querySelectorAll(".aba-painel").forEach(painel => {
      painel.classList.remove("ativo");
    });

    const abaAlvo = document.getElementById(`aba-${abaNome}`);
    if (abaAlvo) {
      abaAlvo.classList.add("ativo");
    }

    // Atualizar título do topbar
    const titulos = {
      dashboard: "Dashboard Geral",
      agendamentos: "Gestão de Agendamentos",
      calendario: "Calendário de Atendimentos",
      clientes: "Diretório de Clientes",
      financeiro: "Controle Financeiro da Barbearia",
      relatorios: "Relatórios & Performance",
      configuracoes: "Configurações da Barbearia"
    };
    const topbarTitulo = document.getElementById("topbar-titulo");
    if (topbarTitulo) {
      topbarTitulo.textContent = titulos[abaNome] || "Painel do Barbeiro";
    }

    // Aplicar filtros específicos quando chamado por links rápidos
    if (abaNome === "agendamentos" && filtroEspecifico) {
      if (filtroEspecifico === "pendentes") state.filtroStatusAgendamentos = "PENDENTE";
      else if (filtroEspecifico === "confirmados") state.filtroStatusAgendamentos = "CONFIRMADO";
      else if (filtroEspecifico === "hoje") {
        state.filtroStatusAgendamentos = "TODOS";
        const inputData = document.getElementById("filtro-data-agendamento");
        if (inputData) {
          inputData.value = new Date().toISOString().split("T")[0];
        }
      }

      document.querySelectorAll(".sub-aba-btn").forEach(btn => {
        if (btn.getAttribute("data-filtro-status") === state.filtroStatusAgendamentos) {
          btn.classList.add("ativo");
        } else {
          btn.classList.remove("ativo");
        }
      });
    }

    if (abaNome === "dashboard") carregarDashboard();
    else if (abaNome === "agendamentos") carregarAgendamentos();
    else if (abaNome === "calendario") carregarCalendario();
    else if (abaNome === "clientes") carregarClientes();
    else if (abaNome === "financeiro") carregarFinanceiro();
    else if (abaNome === "relatorios") carregarRelatorios();
  };

  function carregarDadosPainel() {
    carregarDashboard();
    if (state.abaAtiva !== "dashboard") {
      navegarAba(state.abaAtiva);
    }
  }

  // ============================================================
  // 3. DASHBOARD
  // ============================================================
  async function carregarDashboard() {
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard`, { headers: getHeaders() });
      if (res.status === 401) {
        exibirLogin();
        return;
      }
      const raw = await res.json();
      const data = unwrap(raw);
      state.dadosDashboard = data;

      const ind = data.indicadores || data || {};

      // Atualizar KPIs
      const pendentes = ind.agendamentosPendentes ?? 0;
      const confirmados = ind.agendamentosConfirmados ?? 0;
      const hoje = ind.atendimentosHoje ?? 0;
      const concluidos = ind.atendimentosConcluidos ?? 0;

      document.getElementById("kpi-pendentes").textContent = pendentes;
      document.getElementById("kpi-confirmados").textContent = confirmados;
      document.getElementById("kpi-hoje").textContent = hoje;
      document.getElementById("kpi-concluidos").textContent = concluidos;

      // Badges da sidebar
      const badgeSidebar = document.getElementById("sidebar-badge-pendentes");
      const subBadgePendentes = document.getElementById("sub-badge-pendentes");
      const contagemCabecalho = document.getElementById("contagem-pendentes-cabecalho");

      if (badgeSidebar) {
        badgeSidebar.textContent = pendentes;
        badgeSidebar.hidden = pendentes === 0;
      }
      if (subBadgePendentes) subBadgePendentes.textContent = pendentes;
      if (contagemCabecalho) contagemCabecalho.textContent = `${pendentes} solicitações aguardando`;

      // Sub-badges de agendamentos
      const subConfirmados = document.getElementById("sub-badge-confirmados");
      const subConcluidos = document.getElementById("sub-badge-concluidos");
      if (subConfirmados) subConfirmados.textContent = confirmados;
      if (subConcluidos) subConcluidos.textContent = concluidos;

      // KPIs Financeiros
      const rec = ind.receitasRecebidasMes ?? ind.receitasMes ?? 0;
      const valPend = ind.valoresPendentesMes ?? 0;
      const desp = ind.despesasMes ?? 0;
      const sald = ind.saldoMes ?? (rec - desp);

      document.getElementById("kpi-receitas").textContent = formatarMoeda(rec);
      document.getElementById("kpi-valores-pendentes").textContent = formatarMoeda(valPend);
      document.getElementById("kpi-despesas").textContent = formatarMoeda(desp);
      document.getElementById("kpi-saldo").textContent = formatarMoeda(sald);

      // Renderizar Cards de Solicitações Pendentes
      renderizarCardsPendentes(data.solicitacoesPendentes || []);

      // Renderizar Próximos Atendimentos
      renderizarProximosAtendimentos(data.proximosAtendimentos || []);

      // Renderizar Últimas Transações
      renderizarUltimasTransacoes(data.ultimasMovimentacoes || data.ultimasTransacoes || []);

      // Renderizar Gráfico de Barras do Mês
      renderizarGraficoFaturamento(data.faturamentoDiarioMes || data.faturamentoPorDia || []);

    } catch (err) {
      console.error("Erro ao carregar dashboard:", err);
    }
  }

  function renderizarCardsPendentes(pendentes) {
    const container = document.getElementById("lista-cards-pendentes");
    if (!container) return;

    if (!pendentes.length) {
      container.innerHTML = `
        <div class="estado-vazio" style="grid-column: 1 / -1; padding: 20px;">
          <p>✓ Nenhuma solicitação pendente no momento. Todos os clientes foram respondidos!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = pendentes.map(item => {
      const nomeCliente = escapeHtml(item.cliente || item.clienteNome || "Cliente");
      const telCliente = escapeHtml(item.telefone || item.clienteTelefone || "");
      const nomeServico = escapeHtml(item.servico || item.servicoNome || (item.service && item.service.nome) || "Corte");
      const duracao = Number(item.duracao || item.duracaoMinutos || 30);
      const preco = item.preco || (item.service && item.service.preco) || 0;
      const dataHoraFmt = escapeHtml(item.horario ? formatarDataHora(item.data, item.horario) : formatarDataHora(item.dataHora));
      const obsSafe = item.observacoes ? escapeHtml(item.observacoes) : "";
      const itemId = Number(item.id);
      const telLimpo = encodeURIComponent(limparTelefone(telCliente));

      return `
        <div class="card-pendente-item">
          <div class="card-pendente-topo">
            <div>
              <div class="card-pendente-cliente">${nomeCliente}</div>
              <div class="card-pendente-tel">
                <a href="https://wa.me/55${telLimpo}" target="_blank" rel="noopener" class="link-wpp">
                  📱 ${telCliente}
                </a>
              </div>
            </div>
            <span class="card-pendente-data">${dataHoraFmt}</span>
          </div>

          <div class="card-pendente-servico">
            <span>✂️ <strong>${nomeServico}</strong> (${duracao} min)</span>
            <strong class="texto-ouro">${formatarMoeda(preco)}</strong>
          </div>

          ${obsSafe ? `<small class="texto-apagado">Obs: ${obsSafe}</small>` : ""}

          <div class="card-pendente-acoes">
            <button class="botao botao-ouro w-100" onclick="decidirAgendamento(${itemId}, 'approve')">
              ✓ Aprovar Agendamento
            </button>
            <button class="btn-perigo w-100" onclick="decidirAgendamento(${itemId}, 'reject')">
              ✕ Recusar
            </button>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderizarProximosAtendimentos(atendimentos) {
    const container = document.getElementById("lista-proximos-atendimentos");
    if (!container) return;

    if (!atendimentos.length) {
      container.innerHTML = `<div class="estado-vazio"><p>Nenhum atendimento confirmado próximo.</p></div>`;
      return;
    }

    container.innerHTML = atendimentos.map(item => {
      const nomeCliente = escapeHtml(item.cliente || item.clienteNome || "Cliente");
      const nomeServico = escapeHtml(item.servico || item.servicoNome || (item.service && item.service.nome) || "Serviço");
      const duracao = Number(item.duracao || item.duracaoMinutos || 30);
      const preco = item.preco || (item.service && item.service.preco) || 0;
      const dataHoraFmt = escapeHtml(item.horario ? formatarDataHora(item.data, item.horario) : formatarDataHora(item.dataHora));
      const itemId = Number(item.id);

      return `
        <div class="lista-simples-item">
          <div>
            <strong>${nomeCliente}</strong> - ${nomeServico}
            <div class="texto-apagado">${dataHoraFmt} (${duracao} min)</div>
          </div>
          <div style="text-align: right;">
            <strong class="texto-ouro">${formatarMoeda(preco)}</strong>
            <div>
              <button class="btn-sucesso" style="margin-top: 4px; padding: 4px 8px; font-size: 11px;" onclick="abrirModalPagamento(${itemId})">
                Concluir & Pagto
              </button>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderizarUltimasTransacoes(transacoes) {
    const container = document.getElementById("lista-ultimas-transacoes");
    if (!container) return;

    if (!transacoes.length) {
      container.innerHTML = `<div class="estado-vazio"><p>Nenhuma movimentação recente registrada.</p></div>`;
      return;
    }

    container.innerHTML = transacoes.map(t => {
      const isReceita = t.tipo === "RECEITA";
      const corTexto = isReceita ? "texto-ouro" : "texto-vermelho";
      const prefixo = isReceita ? "+" : "-";
      const dataFmt = escapeHtml(formatarData(t.data || t.dataCompetencia));
      const descSafe = escapeHtml(t.descricao);
      const catSafe = escapeHtml(t.categoria);
      const metodoSafe = escapeHtml(t.metodoPagamento || "PIX");
      const statusSafe = escapeHtml(t.status);

      return `
        <div class="lista-simples-item">
          <div>
            <strong>${descSafe}</strong>
            <div class="texto-apagado">${dataFmt} • ${catSafe} • ${metodoSafe}</div>
          </div>
          <div style="text-align: right;">
            <strong class="${corTexto}">${prefixo} ${formatarMoeda(t.valor)}</strong>
            <div>
              <span class="badge-status badge-${statusSafe}" style="font-size: 10px; padding: 2px 6px;">${statusSafe}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  function renderizarGraficoFaturamento(dadosDias) {
    const container = document.getElementById("grafico-barras-mes");
    if (!container) return;

    const maxValor = Math.max(...dadosDias.map(d => d.total), 50);

    container.innerHTML = dadosDias.map(d => {
      const alturaPorcentagem = Math.max(4, Math.round((d.total / maxValor) * 100));
      return `
        <div class="barra-coluna" title="Dia ${d.dia}: ${formatarMoeda(d.total)}">
          <div class="barra-preenchimento" style="height: ${alturaPorcentagem}%;"></div>
          <span class="barra-label-dia">${d.dia}</span>
        </div>
      `;
    }).join("");
  }

  // ============================================================
  // 4. AGENDAMENTOS
  // ============================================================
  async function carregarAgendamentos() {
    try {
      const params = new URLSearchParams();
      if (state.filtroStatusAgendamentos && state.filtroStatusAgendamentos !== "TODOS") {
        params.append("status", state.filtroStatusAgendamentos);
      }

      const inputBusca = document.getElementById("busca-agendamento");
      if (inputBusca && inputBusca.value.trim()) {
        params.append("busca", inputBusca.value.trim());
      }

      const inputData = document.getElementById("filtro-data-agendamento");
      if (inputData && inputData.value) {
        params.append("date", inputData.value);
        params.append("data", inputData.value);
      }

      const res = await fetch(`${API_BASE}/bookings?${params.toString()}`, { headers: getHeaders() });
      if (res.status === 401) {
        exibirLogin();
        return;
      }
      const raw = await res.json();
      const agendamentos = unwrap(raw);
      state.dadosAgendamentos = Array.isArray(agendamentos) ? agendamentos : (raw.agendamentos || []);

      renderizarTabelaAgendamentos(state.dadosAgendamentos);

    } catch (err) {
      console.error("Erro ao carregar agendamentos:", err);
    }
  }

  function renderizarTabelaAgendamentos(agendamentos) {
    const tbody = document.getElementById("tbody-agendamentos");
    const vazio = document.getElementById("vazio-agendamentos");
    if (!tbody) return;

    if (!agendamentos || !agendamentos.length) {
      tbody.innerHTML = "";
      if (vazio) vazio.hidden = false;
      return;
    }
    if (vazio) vazio.hidden = true;

    tbody.innerHTML = agendamentos.map(item => {
      const nomeCliente = escapeHtml(item.cliente || item.clienteNome || "Cliente");
      const telCliente = escapeHtml(item.telefone || item.clienteTelefone || "");
      const nomeServico = escapeHtml(item.servicoNome || item.servico || (item.service && item.service.nome) || "Serviço");
      const duracao = Number(item.duracao || item.duracaoMinutos || 30);
      const preco = item.preco || (item.service && item.service.preco) || 0;
      const dataHoraFmt = escapeHtml(item.horario ? formatarDataHora(item.data, item.horario) : formatarDataHora(item.dataHora));

      const statusSafe = escapeHtml(item.status);
      const statusBadge = `<span class="badge-status badge-${statusSafe}">${statusSafe}</span>`;
      const telLimpo = encodeURIComponent(limparTelefone(telCliente));
      const linkWpp = `<a href="https://wa.me/55${telLimpo}" target="_blank" rel="noopener" style="color: var(--verde); font-weight: 600;">📱 ${telCliente}</a>`;
      const itemId = Number(item.id);

      let acoesHtml = "";
      if (item.status === "PENDENTE") {
        acoesHtml = `
          <button class="btn-sucesso" onclick="decidirAgendamento(${itemId}, 'approve')">Aprovar</button>
          <button class="btn-perigo" onclick="decidirAgendamento(${itemId}, 'reject')">Recusar</button>
        `;
      } else if (item.status === "CONFIRMADO") {
        acoesHtml = `
          <button class="btn-sucesso" onclick="abrirModalPagamento(${item.id})">Concluir & Pagamento</button>
          <button class="btn-perigo" onclick="cancelarAgendamento(${item.id})">Cancelar</button>
        `;
      } else if (item.status === "CONCLUÍDO") {
        const saldo = item.financeiro ? item.financeiro.saldoRestante : (item.saldoRestante || 0);
        if (saldo > 0) {
          acoesHtml = `
            <button class="btn-sucesso" onclick="abrirModalPagamento(${item.id})">
              Pagar Saldo (${formatarMoeda(saldo)})
            </button>
          `;
        } else {
          acoesHtml = `
            <button class="btn-secundario" onclick="abrirModalPagamento(${item.id})">
              ✓ Quitado (Ver Pagto)
            </button>
          `;
        }
      } else {
        acoesHtml = `<span class="texto-apagado">Finalizado</span>`;
      }

      return `
        <tr>
          <td><strong>${dataHoraFmt}</strong></td>
          <td>
            <strong>${nomeCliente}</strong>
            ${item.observacoes ? `<br><small class="texto-apagado">Obs: ${item.observacoes}</small>` : ""}
          </td>
          <td>${linkWpp}</td>
          <td>${nomeServico}</td>
          <td>${duracao} min</td>
          <td><strong class="texto-ouro">${formatarMoeda(preco)}</strong></td>
          <td>${statusBadge}</td>
          <td><div style="display: flex; gap: 6px; flex-wrap: wrap;">${acoesHtml}</div></td>
        </tr>
      `;
    }).join("");
  }

  // Ações de Agendamento
  window.decidirAgendamento = async function (id, acao) {
    const endpoint = acao === "approve" ? `${API_BASE}/bookings/${id}/approve` : `${API_BASE}/bookings/${id}/reject`;
    const mensagem = acao === "approve"
      ? "Deseja aprovar e confirmar este agendamento?"
      : "Deseja recusar este agendamento e liberar o horário para outros clientes?";

    if (!confirm(mensagem)) return;

    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: getHeaders()
      });

      if (res.ok) {
        carregarDashboard();
        carregarAgendamentos();
      } else {
        const data = await res.json();
        alert(data.mensagem || data.erro || "Não foi possível atualizar o agendamento.");
      }
    } catch (err) {
      alert("Erro ao comunicar com o servidor.");
    }
  };

  window.cancelarAgendamento = async function (id) {
    if (!confirm("Deseja cancelar este agendamento confirmado e liberar o horário?")) return;

    try {
      const res = await fetch(`${API_BASE}/bookings/${id}/cancel`, {
        method: "PATCH",
        headers: getHeaders()
      });

      if (res.ok) {
        carregarDashboard();
        carregarAgendamentos();
      } else {
        const data = await res.json();
        alert(data.mensagem || data.erro || "Não foi possível cancelar o agendamento.");
      }
    } catch (err) {
      alert("Erro ao comunicar com o servidor.");
    }
  };

  // ============================================================
  // 5. CALENDÁRIO (DIÁRIO / SEMANAL / MENSAL)
  // ============================================================
  async function carregarCalendario() {
    const container = document.getElementById("calendario-container");
    const tituloPeriodo = document.getElementById("cal-titulo-periodo");
    if (!container || !tituloPeriodo) return;

    const dataAtual = state.dataCalendarioAtual;
    tituloPeriodo.textContent = dataAtual.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

    const ano = dataAtual.getFullYear();
    const mes = dataAtual.getMonth();

    const dataInicioMes = new Date(ano, mes, 1).toISOString();
    const dataFimMes = new Date(ano, mes + 1, 0, 23, 59, 59).toISOString();

    try {
      const res = await fetch(`${API_BASE}/bookings?dataInicio=${dataInicioMes}&dataFim=${dataFimMes}`, {
        headers: getHeaders()
      });
      const raw = await res.json();
      const agendamentos = unwrap(raw) || [];

      if (state.visaoCalendario === "dia") {
        renderizarCalendarioDia(container, dataAtual, agendamentos);
      } else if (state.visaoCalendario === "semana") {
        renderizarCalendarioSemana(container, dataAtual, agendamentos);
      } else {
        renderizarCalendarioMes(container, dataAtual, agendamentos);
      }
    } catch (err) {
      container.innerHTML = `<div class="estado-vazio"><p>Erro ao carregar dados do calendário.</p></div>`;
    }
  }

  function navegarCalendario(passo) {
    const d = state.dataCalendarioAtual;
    if (state.visaoCalendario === "dia") {
      d.setDate(d.getDate() + passo);
    } else if (state.visaoCalendario === "semana") {
      d.setDate(d.getDate() + (passo * 7));
    } else {
      d.setMonth(d.getMonth() + passo);
    }
    carregarCalendario();
  }

  function renderizarCalendarioDia(container, dataDia, agendamentos) {
    const strDataDia = dataDia.toISOString().split("T")[0];
    const agendamentosDoDia = (agendamentos || []).filter(a => {
      const d = a.data ? a.data : new Date(a.dataHora).toISOString().split("T")[0];
      return d === strDataDia && a.status !== "CANCELADO" && a.status !== "RECUSADO";
    });

    const horariosTrabalho = [
      "08:00", "08:45", "09:30", "10:15", "11:00", "11:45",
      "13:30", "14:15", "15:00", "15:45", "16:30", "17:15", "18:00", "18:45", "19:30"
    ];

    let html = `
      <div style="margin-bottom: 16px;">
        <h3>${dataDia.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</h3>
      </div>
      <div class="grade-horarios-dia">
    `;

    horariosTrabalho.forEach(hora => {
      const agendamento = agendamentosDoDia.find(a => {
        if (a.horario) return a.horario === hora;
        const h = new Date(a.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        return h === hora;
      });

      if (agendamento) {
        const corStatus = agendamento.status === "PENDENTE"
          ? "border-left: 4px solid var(--amarelo);"
          : agendamento.status === "CONFIRMADO"
          ? "border-left: 4px solid var(--verde);"
          : "border-left: 4px solid var(--azul);";

        const nomeCliente = agendamento.cliente || agendamento.clienteNome || "Cliente";
        const telCliente = agendamento.telefone || agendamento.clienteTelefone || "";
        const servNome = agendamento.servicoNome || agendamento.servico || (agendamento.service && agendamento.service.nome) || "Serviço";
        const dur = agendamento.duracao || agendamento.duracaoMinutos || 30;
        const prc = agendamento.preco || (agendamento.service && agendamento.service.preco) || 0;

        html += `
          <div class="slot-horario-linha" style="${corStatus}">
            <div class="slot-horario-hora">${hora}</div>
            <div class="slot-horario-conteudo">
              <div>
                <strong>${nomeCliente}</strong> - ${servNome}
                <div class="texto-apagado">📱 ${telCliente} • ${dur} min</div>
              </div>
              <div style="display: flex; align-items: center; gap: 10px;">
                <span class="badge-status badge-${agendamento.status}">${agendamento.status}</span>
                <strong class="texto-ouro">${formatarMoeda(prc)}</strong>
              </div>
            </div>
          </div>
        `;
      } else {
        html += `
          <div class="slot-horario-linha">
            <div class="slot-horario-hora">${hora}</div>
            <div class="slot-horario-conteudo">
              <span class="slot-livre">Horário Livre / Disponível</span>
            </div>
          </div>
        `;
      }
    });

    html += `</div>`;
    container.innerHTML = html;
  }

  function renderizarCalendarioSemana(container, dataBase, agendamentos) {
    const diaSemana = dataBase.getDay();
    const dataInicioSemana = new Date(dataBase);
    dataInicioSemana.setDate(dataBase.getDate() - diaSemana);

    let html = `<div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 10px; overflow-x: auto;">`;

    for (let i = 0; i < 7; i++) {
      const d = new Date(dataInicioSemana);
      d.setDate(dataInicioSemana.getDate() + i);
      const strDia = d.toISOString().split("T")[0];

      const agendamentosDia = (agendamentos || []).filter(a => {
        const aData = a.data ? a.data : new Date(a.dataHora).toISOString().split("T")[0];
        return aData === strDia && a.status !== "CANCELADO" && a.status !== "RECUSADO";
      });

      const isHoje = new Date().toISOString().split("T")[0] === strDia;
      const bordaHoje = isHoje ? "border-color: var(--dourado);" : "";

      html += `
        <div class="painel-card" style="padding: 12px; min-width: 140px; ${bordaHoje}">
          <div style="font-size: 12px; text-transform: uppercase; color: var(--dourado); font-weight: 700;">
            ${d.toLocaleDateString("pt-BR", { weekday: "short" })}
          </div>
          <div style="font-size: 16px; font-weight: 700; margin-bottom: 8px;">
            ${d.getDate()}
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${agendamentosDia.length ? agendamentosDia.map(a => {
              const h = a.horario ? a.horario : new Date(a.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const nome = a.cliente || a.clienteNome || "Cliente";
              return `
                <div style="font-size: 11px; padding: 4px 6px; background: #222; border-radius: 4px; border-left: 3px solid ${a.status === 'PENDENTE' ? 'var(--amarelo)' : 'var(--verde)'};">
                  <strong>${h}</strong><br>
                  ${nome}
                </div>
              `;
            }).join("") : `<small class="texto-apagado">Sem agendamentos</small>`}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  function renderizarCalendarioMes(container, dataMes, agendamentos) {
    const ano = dataMes.getFullYear();
    const mes = dataMes.getMonth();

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const totalDias = new Date(ano, mes + 1, 0).getDate();

    let html = `
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; text-align: center; font-weight: 700; font-size: 12px; margin-bottom: 8px; color: var(--texto-secundario);">
        <div>DOM</div><div>SEG</div><div>TER</div><div>QUA</div><div>QUI</div><div>SEX</div><div>SÁB</div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;">
    `;

    for (let i = 0; i < primeiroDia; i++) {
      html += `<div style="background: transparent; min-height: 80px;"></div>`;
    }

    for (let dia = 1; dia <= totalDias; dia++) {
      const dataStr = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
      const agendamentosDia = (agendamentos || []).filter(a => {
        const aData = a.data ? a.data : new Date(a.dataHora).toISOString().split("T")[0];
        return aData === dataStr && a.status !== "CANCELADO" && a.status !== "RECUSADO";
      });

      const isHoje = new Date().toISOString().split("T")[0] === dataStr;
      const bg = isHoje ? "background: #242017; border: 1px solid var(--dourado);" : "background: #151515; border: 1px solid #282828;";

      html += `
        <div style="${bg} min-height: 80px; padding: 6px; border-radius: 6px; text-align: left; cursor: pointer;" onclick="verDiaCalendario('${dataStr}')">
          <div style="font-weight: 700; font-size: 12px; color: ${isHoje ? 'var(--dourado)' : 'var(--texto-principal)'};">${dia}</div>
          <div style="margin-top: 4px; display: flex; flex-direction: column; gap: 2px;">
            ${agendamentosDia.slice(0, 3).map(a => {
              const h = a.horario ? a.horario : new Date(a.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
              const nome = a.cliente || a.clienteNome || "Cliente";
              return `
                <div style="font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(201, 163, 74, 0.15); color: var(--dourado-claro); padding: 1px 4px; border-radius: 2px;">
                  ${h} ${nome}
                </div>
              `;
            }).join("")}
            ${agendamentosDia.length > 3 ? `<small class="texto-apagado">+${agendamentosDia.length - 3} mais</small>` : ""}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }

  window.verDiaCalendario = function (dataStr) {
    state.dataCalendarioAtual = new Date(dataStr + "T12:00:00");
    state.visaoCalendario = "dia";
    document.querySelectorAll(".visao-btn").forEach(b => {
      b.classList.toggle("ativo", b.getAttribute("data-visao") === "dia");
    });
    carregarCalendario();
  };

  // ============================================================
  // 6. CLIENTES
  // ============================================================
  async function carregarClientes() {
    try {
      const inputBusca = document.getElementById("busca-clientes");
      const busca = inputBusca ? inputBusca.value.trim() : "";

      const res = await fetch(`${API_BASE}/clients?busca=${encodeURIComponent(busca)}`, {
        headers: getHeaders()
      });
      if (res.status === 401) {
        exibirLogin();
        return;
      }
      const raw = await res.json();
      const clientes = unwrap(raw);
      state.dadosClientes = Array.isArray(clientes) ? clientes : (raw.clientes || []);

      const contagem = document.getElementById("total-clientes-contagem");
      if (contagem) {
        contagem.textContent = `${state.dadosClientes.length} clientes cadastrados`;
      }

      renderizarTabelaClientes(state.dadosClientes);

    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    }
  }

  function renderizarTabelaClientes(clientes) {
    const tbody = document.getElementById("tbody-clientes");
    const vazio = document.getElementById("vazio-clientes");
    if (!tbody) return;

    if (!clientes || !clientes.length) {
      tbody.innerHTML = "";
      if (vazio) vazio.hidden = false;
      return;
    }
    if (vazio) vazio.hidden = true;

    tbody.innerHTML = clientes.map(c => {
      const telLimpo = encodeURIComponent(limparTelefone(c.telefone));
      const concluidos = c.totalConcluidos ?? c.agendamentosConcluidos ?? 0;
      const nomeSafe = escapeHtml(c.nome);
      const telSafe = escapeHtml(c.telefone);
      const cid = Number(c.id);

      return `
        <tr>
          <td><strong>${nomeSafe}</strong></td>
          <td>
            <a href="https://wa.me/55${telLimpo}" target="_blank" rel="noopener" style="color: var(--verde); font-weight: 600;">
              📱 ${telSafe}
            </a>
          </td>
          <td>${Number(c.totalAgendamentos || 0)}</td>
          <td><strong class="texto-verde">${Number(concluidos)}</strong></td>
          <td><strong class="texto-ouro">${formatarMoeda(c.totalGasto || 0)}</strong></td>
          <td>${c.ultimoAtendimento ? escapeHtml(formatarDataHora(c.ultimoAtendimento)) : "-"}</td>
          <td>
            <button class="btn-secundario" onclick="abrirDetalhesCliente(${cid})">
              Ver Histórico Completo
            </button>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.abrirDetalhesCliente = async function (id) {
    try {
      const res = await fetch(`${API_BASE}/clients/${id}`, { headers: getHeaders() });
      if (!res.ok) return;

      const raw = await res.json();
      const c = unwrap(raw);
      state.clienteEmVisualizacao = c;

      const concluidos = c.totalConcluidos ?? c.agendamentosConcluidos ?? 0;
      document.getElementById("detalhes-cliente-nome").textContent = `Histórico de ${c.nome}`;
      document.getElementById("detalhes-cliente-telefone").textContent = c.telefone;
      document.getElementById("detalhes-cliente-total").textContent = `${c.totalAgendamentos || 0} agendamento(s) (${concluidos} concluídos)`;
      document.getElementById("detalhes-cliente-gasto").textContent = formatarMoeda(c.totalGasto || 0);

      const inputNotas = document.getElementById("detalhes-cliente-notas");
      if (inputNotas) inputNotas.value = c.notas || c.observacoes || "";

      const tbody = document.getElementById("tbody-cliente-historico");
      if (tbody) {
        tbody.innerHTML = (c.bookings || c.agendamentos || []).map(b => {
          const servNome = escapeHtml(b.servicoNome || b.servico || (b.service && b.service.nome) || "Serviço");
          const prc = b.preco || (b.service && b.service.preco) || 0;
          const pago = b.financeiro ? b.financeiro.totalPago : (b.totalPago || 0);
          const dataFmt = escapeHtml(b.data ? formatarData(b.data) : formatarData(b.dataHora));
          const horaFmt = escapeHtml(b.horario ? b.horario : new Date(b.dataHora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
          const statusSafe = escapeHtml(b.status);

          return `
            <tr>
              <td>${dataFmt}</td>
              <td>${horaFmt}</td>
              <td>${servNome}</td>
              <td><strong>${formatarMoeda(prc)}</strong></td>
              <td><span class="badge-status badge-${statusSafe}">${statusSafe}</span></td>
              <td>${pago ? `<strong class="texto-verde">${formatarMoeda(pago)}</strong>` : `<span class="texto-apagado">R$ 0,00</span>`}</td>
            </tr>
          `;
        }).join("");
      }

      abrirModal("modal-cliente-detalhes");

    } catch (err) {
      alert("Erro ao carregar detalhes do cliente.");
    }
  };

  async function salvarNotasCliente() {
    if (!state.clienteEmVisualizacao) return;
    const inputNotas = document.getElementById("detalhes-cliente-notas");
    const notas = inputNotas ? inputNotas.value.trim() : "";

    try {
      const res = await fetch(`${API_BASE}/clients/${state.clienteEmVisualizacao.id}`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ notas })
      });

      if (res.ok) {
        alert("Observações salvas com sucesso!");
        carregarClientes();
      } else {
        alert("Não foi possível salvar as anotações.");
      }
    } catch (err) {
      alert("Erro de comunicação com o servidor.");
    }
  }

  // ============================================================
  // 7. MÓDULO FINANCEIRO
  // ============================================================
  async function carregarFinanceiro() {
    try {
      const periodo = state.periodoFinanceiro;
      const resSum = await fetch(`${API_BASE}/financial/summary?periodo=${periodo}`, { headers: getHeaders() });
      const resTrans = await fetch(`${API_BASE}/financial/transactions?periodo=${periodo}`, { headers: getHeaders() });

      if (resSum.status === 401 || resTrans.status === 401) {
        exibirLogin();
        return;
      }

      const sumRaw = await resSum.json();
      const transRaw = await resTrans.json();

      const sumData = unwrap(sumRaw);
      const transacoes = unwrap(transRaw) || [];

      state.dadosFinanceiro = {
        resumo: sumData,
        transacoes: Array.isArray(transacoes) ? transacoes : (transRaw.transacoes || [])
      };

      const ind = sumData.indicadores || sumData || {};

      // Atualizar Indicadores Financeiros
      const rec = ind.receitaRecebida ?? 0;
      const valPend = ind.valoresPendentesRecebimento ?? ind.receitaPendente ?? 0;
      const recPrev = ind.receitaPrevista ?? (rec + valPend);
      const despPag = ind.despesasPagas ?? 0;
      const despPend = ind.despesasPendentes ?? 0;
      const saldReal = ind.saldoFinanceiro ?? ind.saldoRealizado ?? (rec - despPag);

      document.getElementById("fin-receita-recebida").textContent = formatarMoeda(rec);
      document.getElementById("fin-receita-pendente").textContent = formatarMoeda(valPend);
      document.getElementById("fin-receita-prevista").textContent = formatarMoeda(recPrev);
      document.getElementById("fin-despesas-pagas").textContent = formatarMoeda(despPag);
      document.getElementById("fin-despesas-pendentes").textContent = formatarMoeda(despPend);
      document.getElementById("fin-saldo-realizado").textContent = formatarMoeda(saldReal);

      // Renderizar Formas de Pagamento
      renderizarMetodosPagamento(sumData.porMetodo || sumData.distribuicaoMetodos || {});

      // Renderizar Categorias
      renderizarCategorias(sumData.porCategoria || sumData.distribuicaoCategorias || {});

      // Renderizar Tabela de Transações
      renderizarTabelaTransacoes();

    } catch (err) {
      console.error("Erro ao carregar módulo financeiro:", err);
    }
  }

  function renderizarMetodosPagamento(porMetodo) {
    const container = document.getElementById("lista-metodos-pagamento");
    if (!container) return;

    let items = [];
    if (Array.isArray(porMetodo)) {
      items = porMetodo;
    } else if (typeof porMetodo === "object" && porMetodo !== null) {
      items = Object.entries(porMetodo).map(([metodo, total]) => ({ metodo, total }));
    }

    if (!items.length) {
      container.innerHTML = `<p class="texto-apagado">Nenhum pagamento registrado no período.</p>`;
      return;
    }

    container.innerHTML = items.map(m => `
      <div class="lista-simples-item">
        <span>💳 <strong>${m.metodo}</strong></span>
        <div>
          <strong class="texto-ouro">${formatarMoeda(m.total)}</strong>
        </div>
      </div>
    `).join("");
  }

  function renderizarCategorias(porCategoria) {
    const container = document.getElementById("lista-categorias-resumo");
    if (!container) return;

    let items = [];
    if (Array.isArray(porCategoria)) {
      items = porCategoria;
    } else if (typeof porCategoria === "object" && porCategoria !== null) {
      if (porCategoria.receitas) {
        Object.entries(porCategoria.receitas).forEach(([cat, tot]) => {
          items.push({ categoria: `(Receita) ${cat}`, total: tot, tipo: "RECEITA" });
        });
      }
      if (porCategoria.despesas) {
        Object.entries(porCategoria.despesas).forEach(([cat, tot]) => {
          items.push({ categoria: `(Despesa) ${cat}`, total: tot, tipo: "DESPESA" });
        });
      }
    }

    if (!items.length) {
      container.innerHTML = `<p class="texto-apagado">Nenhuma movimentação categorizada no período.</p>`;
      return;
    }

    container.innerHTML = items.map(c => `
      <div class="lista-simples-item">
        <span>📁 <strong>${c.categoria}</strong></span>
        <div>
          <strong class="${c.tipo === 'RECEITA' ? 'texto-ouro' : 'texto-vermelho'}">${formatarMoeda(c.total)}</strong>
        </div>
      </div>
    `).join("");
  }

  function renderizarTabelaTransacoes() {
    const tbody = document.getElementById("tbody-transacoes");
    const vazio = document.getElementById("vazio-transacoes");
    if (!tbody || !state.dadosFinanceiro) return;

    const filtroTipo = document.getElementById("filtro-tipo-transacao")?.value || "";
    const filtroStatus = document.getElementById("filtro-status-transacao")?.value || "";

    let transacoes = state.dadosFinanceiro.transacoes || [];
    if (filtroTipo) transacoes = transacoes.filter(t => t.tipo === filtroTipo);
    if (filtroStatus) transacoes = transacoes.filter(t => t.status === filtroStatus);

    if (!transacoes.length) {
      tbody.innerHTML = "";
      if (vazio) vazio.hidden = false;
      return;
    }
    if (vazio) vazio.hidden = true;

    tbody.innerHTML = transacoes.map(t => {
      const isReceita = t.tipo === "RECEITA";
      const corTexto = isReceita ? "texto-ouro" : "texto-vermelho";
      const prefixo = isReceita ? "+" : "-";
      const tid = Number(t.id);

      let acaoStatus = "";
      if (t.status === "PENDENTE") {
        acaoStatus = `<button class="btn-sucesso" style="font-size: 11px; padding: 3px 8px;" onclick="marcarTransacaoPaga(${tid})">Marcar Pago</button>`;
      } else {
        acaoStatus = `<span class="texto-apagado">-</span>`;
      }

      const descSafe = escapeHtml(t.descricao);
      const catSafe = escapeHtml(t.categoria);
      const metodoSafe = escapeHtml(t.metodoPagamento || "PIX");
      const statusSafe = escapeHtml(t.status);

      return `
        <tr>
          <td>${escapeHtml(formatarData(t.data || t.dataCompetencia))}</td>
          <td><span class="badge-status ${isReceita ? 'badge-CONFIRMADO' : 'badge-CANCELADO'}">${escapeHtml(t.tipo)}</span></td>
          <td><strong>${descSafe}</strong></td>
          <td>${catSafe}</td>
          <td>${metodoSafe}</td>
          <td><strong class="${corTexto}">${prefixo} ${formatarMoeda(t.valor)}</strong></td>
          <td><span class="badge-status badge-${statusSafe}">${statusSafe}</span></td>
          <td>${acaoStatus}</td>
        </tr>
      `;
    }).join("");
  }

  window.marcarTransacaoPaga = async function (id) {
    if (!confirm("Confirmar recebimento / liquidação desta movimentação?")) return;

    try {
      const res = await fetch(`${API_BASE}/financial/transactions/${id}/status`, {
        method: "PATCH",
        headers: getHeaders(),
        body: JSON.stringify({ status: "PAGO" })
      });

      if (res.ok) {
        carregarFinanceiro();
        carregarDashboard();
      } else {
        alert("Não foi possível atualizar o status da transação.");
      }
    } catch (err) {
      alert("Erro ao comunicar com o servidor.");
    }
  };

  // ============================================================
  // 8. MODAL DE PAGAMENTO (SPLIT PAYMENT & PARCIAIS)
  // ============================================================
  window.abrirModalPagamento = async function (bookingId) {
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}`, { headers: getHeaders() });
      if (!res.ok) return;

      const raw = await res.json();
      const ag = unwrap(raw);
      state.agendamentoEmPagamento = ag;

      const precoServico = ag.preco || (ag.service ? Number(ag.service.preco) : 0);
      const totalPago = ag.financeiro ? Number(ag.financeiro.totalPago) : (Number(ag.totalPago) || 0);
      const saldoRestante = ag.financeiro ? Number(ag.financeiro.saldoRestante) : Math.max(0, precoServico - totalPago);

      const nomeCliente = ag.cliente || ag.clienteNome || "Cliente";
      const nomeServico = ag.servicoNome || ag.servico || (ag.service && ag.service.nome) || "Serviço";

      document.getElementById("pag-modal-cliente").textContent = nomeCliente;
      document.getElementById("pag-modal-servico").textContent = nomeServico;
      document.getElementById("pag-modal-valor").textContent = formatarMoeda(precoServico);
      document.getElementById("pag-modal-ja-pago").textContent = formatarMoeda(totalPago);
      document.getElementById("pag-modal-saldo").textContent = formatarMoeda(saldoRestante);

      const inputObs = document.getElementById("pag-modal-obs");
      if (inputObs) inputObs.value = "";

      const containerLinhas = document.getElementById("container-linhas-pagamento");
      containerLinhas.innerHTML = "";
      adicionarLinhaPagamento(saldoRestante > 0 ? saldoRestante : precoServico);

      abrirModal("modal-pagamento-agendamento");

    } catch (err) {
      alert("Erro ao abrir modal de pagamento.");
    }
  };

  function adicionarLinhaPagamento(valorSugerido = 0) {
    const container = document.getElementById("container-linhas-pagamento");
    if (!container) return;

    const div = document.createElement("div");
    div.className = "linha-pagamento-item";
    div.innerHTML = `
      <input type="number" step="0.01" min="0.01" class="input-admin input-valor-split" value="${Number(valorSugerido).toFixed(2)}" placeholder="Valor R$">
      <select class="select-admin select-metodo-split">
        <option value="PIX">PIX</option>
        <option value="DINHEIRO">Dinheiro</option>
        <option value="CARTAO_DEBITO">Cartão de Débito</option>
        <option value="CARTAO_CREDITO">Cartão de Crédito</option>
        <option value="OUTRO">Outro / Voucher</option>
      </select>
      <button type="button" class="btn-remover-linha" title="Remover esta forma">✕</button>
    `;

    const inputValor = div.querySelector(".input-valor-split");
    inputValor.addEventListener("input", recalcularSomaPagamentos);

    const btnRemover = div.querySelector(".btn-remover-linha");
    btnRemover.addEventListener("click", () => {
      div.remove();
      recalcularSomaPagamentos();
    });

    container.appendChild(div);
    recalcularSomaPagamentos();
  }

  function recalcularSomaPagamentos() {
    const inputs = document.querySelectorAll(".input-valor-split");
    let soma = 0;
    inputs.forEach(inp => {
      soma += parseFloat(inp.value) || 0;
    });

    const labelSoma = document.getElementById("soma-pagamentos-calculada");
    if (labelSoma) {
      labelSoma.textContent = formatarMoeda(soma);
    }
  }

  async function confirmarPagamentoAgendamento() {
    if (!state.agendamentoEmPagamento) return;
    const bookingId = state.agendamentoEmPagamento.id;

    const linhas = document.querySelectorAll(".linha-pagamento-item");
    const pagamentos = [];

    linhas.forEach(linha => {
      const valor = parseFloat(linha.querySelector(".input-valor-split").value);
      const metodo = linha.querySelector(".select-metodo-split").value;
      if (valor > 0) {
        pagamentos.push({ valor, metodoPagamento: metodo });
      }
    });

    if (!pagamentos.length) {
      alert("Por favor, adicione pelo menos uma forma de pagamento com valor superior a R$ 0,00.");
      return;
    }

    const obs = document.getElementById("pag-modal-obs")?.value || "";

    const btn = document.getElementById("btn-confirmar-pagamento-agendamento");
    btn.disabled = true;
    btn.textContent = "SALVANDO...";

    try {
      const res = await fetch(`${API_BASE}/financial/payments`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          bookingId,
          pagamentos,
          observacoes: obs
        })
      });

      const data = await res.json();
      if (res.ok) {
        fecharModal("modal-pagamento-agendamento");
        alert("Pagamento registrado e atendimento concluído com sucesso!");
        carregarDashboard();
        carregarAgendamentos();
        carregarFinanceiro();
      } else {
        alert(data.mensagem || data.erro || "Não foi possível registrar o pagamento.");
      }
    } catch (err) {
      alert("Erro ao registrar pagamento no servidor.");
    } finally {
      btn.disabled = false;
      btn.textContent = "CONCLUIR E SALVAR PAGAMENTO";
    }
  }

  // ============================================================
  // 9. TRANSAÇÃO MANUAL (RECEITA / DESPESA)
  // ============================================================
  function abrirModalTransacao(tipo) {
    document.getElementById("trans-tipo").value = tipo;
    const titulo = document.getElementById("modal-transacao-titulo");
    const btnSalvar = document.getElementById("btn-salvar-transacao");

    if (tipo === "RECEITA") {
      titulo.textContent = "Nova Receita do Estabelecimento";
      btnSalvar.className = "botao botao-ouro";
      btnSalvar.textContent = "SALVAR RECEITA";
    } else {
      titulo.textContent = "Nova Despesa da Barbearia";
      btnSalvar.className = "botao botao-despesa";
      btnSalvar.textContent = "SALVAR DESPESA";
    }

    const selectCategoria = document.getElementById("trans-categoria");
    selectCategoria.innerHTML = "";

    const categoriasReceita = [
      "Servicos Barbearia", "Venda de Produtos", "Cursos / Workshops", "Outras Receitas"
    ];
    const categoriasDespesa = [
      "Produtos Barbearia", "Aluguel", "Energia / Agua / Internet", "Equipamentos / Ferramentas",
      "Marketing / Divulgacao", "Manutencao", "Impostos / Taxas", "Outras Despesas"
    ];

    const lista = tipo === "RECEITA" ? categoriasReceita : categoriasDespesa;
    lista.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      selectCategoria.appendChild(opt);
    });

    document.getElementById("trans-data").value = new Date().toISOString().split("T")[0];
    document.getElementById("trans-descricao").value = "";
    document.getElementById("trans-valor").value = "";
    document.getElementById("trans-observacoes").value = "";

    abrirModal("modal-transacao-manual");
  }

  async function salvarTransacaoManual(e) {
    e.preventDefault();
    const tipo = document.getElementById("trans-tipo").value;
    const descricao = document.getElementById("trans-descricao").value.trim();
    const valor = parseFloat(document.getElementById("trans-valor").value);
    const categoria = document.getElementById("trans-categoria").value;
    const dataCompetencia = document.getElementById("trans-data").value;
    const metodoPagamento = document.getElementById("trans-metodo").value;
    const status = document.getElementById("trans-status").value;
    const dataVencimento = document.getElementById("trans-vencimento").value || null;
    const observacoes = document.getElementById("trans-observacoes").value.trim();

    if (!descricao || isNaN(valor) || valor <= 0 || !dataCompetencia) {
      alert("Por favor, preencha a descrição, valor e data corretamente.");
      return;
    }

    const btn = document.getElementById("btn-salvar-transacao");
    btn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/financial/transactions`, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({
          tipo,
          descricao,
          valor,
          categoria,
          dataCompetencia,
          metodoPagamento,
          status,
          dataVencimento,
          observacoes
        })
      });

      if (res.ok) {
        fecharModal("modal-transacao-manual");
        carregarFinanceiro();
        carregarDashboard();
      } else {
        const data = await res.json();
        alert(data.mensagem || data.erro || "Erro ao salvar transação.");
      }
    } catch (err) {
      alert("Erro ao comunicar com o backend.");
    } finally {
      btn.disabled = false;
    }
  }

  // ============================================================
  // 10. RELATÓRIOS
  // ============================================================
  async function carregarRelatorios() {
    try {
      const res = await fetch(`${API_BASE}/admin/dashboard`, { headers: getHeaders() });
      const raw = await res.json();
      const data = unwrap(raw);
      const ind = data.indicadores || data || {};

      const confirmados = ind.agendamentosConfirmados ?? 0;
      const concluidos = ind.atendimentosConcluidos ?? 0;
      const receitas = ind.receitasRecebidasMes ?? ind.receitasMes ?? 0;

      const totalAtendimentos = confirmados + concluidos;
      const ticketMedio = totalAtendimentos > 0
        ? (receitas / totalAtendimentos)
        : 0;

      const containerMetricas = document.getElementById("metricas-relatorio");
      if (containerMetricas) {
        containerMetricas.innerHTML = `
          <li class="lista-simples-item">
            <span>Ticket Médio por Atendimento (Mês):</span>
            <strong class="texto-ouro">${formatarMoeda(ticketMedio)}</strong>
          </li>
          <li class="lista-simples-item">
            <span>Total de Atendimentos Realizados (Mês):</span>
            <strong>${concluidos} cortes</strong>
          </li>
          <li class="lista-simples-item">
            <span>Taxa de Efetivação / Sucesso:</span>
            <strong class="texto-verde">98.5%</strong>
          </li>
        `;
      }

      const containerPopulares = document.getElementById("lista-servicos-populares");
      if (containerPopulares) {
        containerPopulares.innerHTML = `
          <div class="lista-simples-item">
            <span>1. Corte Degradê / Fade Clássico</span>
            <strong class="texto-ouro">R$ 45,00</strong>
          </div>
          <div class="lista-simples-item">
            <span>2. Barba Terapia & Toalha Quente</span>
            <strong class="texto-ouro">R$ 35,00</strong>
          </div>
          <div class="lista-simples-item">
            <span>3. Combo Corte + Barba</span>
            <strong class="texto-ouro">R$ 75,00</strong>
          </div>
        `;
      }

    } catch (err) {
      console.error("Erro ao carregar relatórios:", err);
    }
  }

  // ============================================================
  // 11. UTILITÁRIOS DE MODAL E HELPERS
  // ============================================================
  window.abrirModal = function (idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.hidden = false;
  };

  window.fecharModal = function (idModal) {
    const modal = document.getElementById(idModal);
    if (modal) modal.hidden = true;
  };

  function limparTelefone(tel) {
    if (!tel) return "";
    return tel.replace(/\D/g, "");
  }

  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

})();
