

const API_URL = (window.location.hostname && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1")
  ? `http://${window.location.hostname}:3000/api`
  : "http://192.168.0.218:3000/api";
let servicos = [];

let servicoSelecionadoId = null;
let dataSelecionada = null;
let horarioSelecionado = null;

const horariosDisponiveis = [
  "09:00", "09:45", "10:30", "11:15", "13:00", "13:45", "14:30", "15:15", "16:00", "16:45", "17:30", "18:15"
];

function formatarDuracao(minutos) {
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;

  if (horas === 0) return `${resto} min`;
  if (resto === 0) return `${horas} h`;

  return `${horas} h ${resto} min`;
}

function formatarPreco(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function obterDataHojeLocal() {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
}

function obterDataLimiteLocal(meses = 4) {
  const agora = new Date();
  const limite = new Date(agora.getFullYear(), agora.getMonth() + meses, agora.getDate());
  return `${limite.getFullYear()}-${String(limite.getMonth() + 1).padStart(2, "0")}-${String(limite.getDate()).padStart(2, "0")}`;
}

async function carregarServicos() {
  const lista = document.querySelector("#lista-servicos");

  try {
    const resposta = await fetch(`${API_URL}/services`);
    if (!resposta.ok) {
      throw new Error(`Erro na requisição: ${resposta.status}`);
    }

    const resultado = await resposta.json();
    servicos = resultado.dados;

    renderizarServicos();
  } catch (erro) {
    console.error("Falha ao carregar serviços da API:", erro);
    if (lista) {
      lista.innerHTML = `
        <p style="color: #E6B8A8; grid-column: 1 / -1; padding: 20px 0;">
          Não foi possível carregar os serviços do servidor no momento. Verifique se o backend está ativo.
        </p>
      `;
    }
  }
}

function renderizarServicos() {
  const lista = document.querySelector("#lista-servicos");

  if (!lista) {
    console.error("Elemento #lista-servicos não encontrado.");
    return;
  }

  lista.innerHTML = servicos.map(servico => `
    <article
      class="servico"
      data-card-id="${servico.id}"
      tabindex="0"
      role="button"
      aria-pressed="false"
      aria-label="${servico.nome}, duração ${formatarDuracao(servico.duracao)}, valor ${formatarPreco(servico.preco)}"
    >
      <div class="servico-cabecalho">
        <h3>${servico.nome}</h3>
        <span class="servico-duracao">${formatarDuracao(servico.duracao)}</span>
      </div>
      <div class="servico-rodape">
        <span class="servico-preco">${formatarPreco(servico.preco)}</span>
        <button
          class="botao botao-selecionar"
          type="button"
          data-servico-id="${servico.id}"
          tabindex="-1"
          aria-hidden="true"
        >
          Selecionar
        </button>
      </div>
    </article>
  `).join("");
}

function navegarParaEtapa(nomeEtapa) {
  const etapas = {
    agendamento: document.querySelector("#etapa-agendamento"),
    cliente: document.querySelector("#etapa-cliente"),
    revisao: document.querySelector("#etapa-revisao"),
    sucesso: document.querySelector("#etapa-sucesso")
  };

  // Garante de forma rigorosa que apenas UMA etapa fique visível por vez,
  // ocultando todas as outras para evitar qualquer duplicação de cards na tela
  Object.keys(etapas).forEach(chave => {
    const el = etapas[chave];
    if (el) {
      if (chave === nomeEtapa) {
        el.hidden = false;
      } else {
        el.hidden = true;
      }
    }
  });

  const etapaAtiva = etapas[nomeEtapa];
  if (etapaAtiva) {
    etapaAtiva.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

function selecionarServico(id) {
  const servico = servicos.find(item => item.id === id);

  if (!servico) return;

  servicoSelecionadoId = servico.id;

  document.querySelectorAll(".servico").forEach(card => {
    const selecionado =
      Number(card.dataset.cardId) === servicoSelecionadoId;

    card.classList.toggle("selecionado", selecionado);
    card.setAttribute("aria-pressed", String(selecionado));

    const botao = card.querySelector(".botao-selecionar");
    if (botao) {
      botao.textContent = selecionado ? "Selecionado" : "Selecionar";
    }
  });

  document.querySelector("#resumo-nome").textContent = servico.nome;
  document.querySelector("#resumo-duracao").textContent =
    `Duração: ${formatarDuracao(servico.duracao)}`;
  document.querySelector("#resumo-preco").textContent =
    formatarPreco(servico.preco);

  const painelAgendamento = document.querySelector("#painel-agendamento");
  if (painelAgendamento) {
    painelAgendamento.hidden = false;
  }

  const resumoServico = document.querySelector("#resumo-servico");
  if (resumoServico) {
    resumoServico.hidden = false;
  }

  // Abre a etapa de data e horário garantindo que cliente e revisão fiquem ocultos
  navegarParaEtapa("agendamento");

  document.querySelector("#mensagem-selecao").textContent = "";
  document.querySelector("#continuar-agendamento").disabled = false;

  // Atualiza ou limpa a data/horário na coluna de resumo
  const resumoLateral = document.querySelector("#resumo-data-hora-lateral");
  const resumoLateralTexto = document.querySelector("#resumo-data-hora-texto");
  if (resumoLateral && resumoLateralTexto) {
    if (dataSelecionada && horarioSelecionado) {
      const partes = dataSelecionada.split("-");
      resumoLateralTexto.textContent = `${partes[2]}/${partes[1]}/${partes[0]} às ${horarioSelecionado}`;
      resumoLateral.hidden = false;
    } else {
      resumoLateral.hidden = true;
    }
  }

  painelAgendamento?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function configurarCalendario() {
  const campoData = document.querySelector("#data-agendamento");
  const listaHorarios = document.querySelector("#lista-horarios");
  const orientacaoHorarios = document.querySelector("#orientacao-horarios");
  const resumoHorario = document.querySelector("#resumo-horario");
  const horarioEscolhido = document.querySelector("#horario-escolhido");
  const mensagemHorario = document.querySelector("#mensagem-horario");
  const botaoConfirmar = document.querySelector("#confirmar-horario");

  if (!campoData) return;

  // 1. Bloquear datas passadas e limitar a 4 meses à frente (liberando dia a dia aos poucos)
  const hoje = obterDataHojeLocal();
  const dataLimite = obterDataLimiteLocal(4);
  campoData.min = hoje;
  campoData.max = dataLimite;

  campoData.addEventListener("change", async () => {
    dataSelecionada = campoData.value;
    horarioSelecionado = null;

    if (resumoHorario) resumoHorario.hidden = true;
    if (mensagemHorario) mensagemHorario.textContent = "";

    const resumoLateral = document.querySelector("#resumo-data-hora-lateral");
    if (resumoLateral) resumoLateral.hidden = true;

    if (!dataSelecionada) {
      if (orientacaoHorarios) {
        orientacaoHorarios.textContent = "Selecione uma data para consultar os horários.";
      }
      if (listaHorarios) listaHorarios.innerHTML = "";
      return;
    }

    if (dataSelecionada < hoje) {
      if (orientacaoHorarios) {
        orientacaoHorarios.textContent = "Não é possível selecionar uma data que já passou. Escolha uma data a partir de hoje.";
      }
      if (listaHorarios) listaHorarios.innerHTML = "";
      return;
    }

    if (dataSelecionada > dataLimite) {
      const [aLim, mLim, dLim] = dataLimite.split("-");
      if (orientacaoHorarios) {
        orientacaoHorarios.textContent = `Agendamentos são permitidos para no máximo 4 meses à frente (disponível até ${dLim}/${mLim}/${aLim}).`;
      }
      if (listaHorarios) listaHorarios.innerHTML = "";
      return;
    }

    const partes = dataSelecionada.split("-");
    const dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;

    if (orientacaoHorarios) {
      orientacaoHorarios.textContent = `Consultando horários disponíveis para ${dataFormatada}...`;
    }
    if (listaHorarios) {
      listaHorarios.innerHTML = `<p style="color: #b9b9b9; padding: 10px 0;">Consultando disponibilidade no banco de dados...</p>`;
    }

    try {
      const resposta = await fetch(
        `${API_URL}/availability?date=${encodeURIComponent(dataSelecionada)}&serviceId=${encodeURIComponent(servicoSelecionadoId)}`
      );
      const resultado = await resposta.json();

      if (!resposta.ok) {
        if (orientacaoHorarios) {
          orientacaoHorarios.textContent = resultado.mensagem || "Não foi possível carregar os horários desta data.";
        }
        if (listaHorarios) listaHorarios.innerHTML = "";
        return;
      }

      const horarios = resultado.horarios || [];

      if (!resultado.disponivel || horarios.length === 0) {
        if (orientacaoHorarios) {
          orientacaoHorarios.textContent = resultado.mensagem || `Não há horários disponíveis para ${dataFormatada}.`;
        }
        if (listaHorarios) listaHorarios.innerHTML = "";
        return;
      }

      if (orientacaoHorarios) {
        orientacaoHorarios.textContent = `Horários disponíveis para ${dataFormatada}:`;
      }

      if (listaHorarios) {
        listaHorarios.innerHTML = horarios.map(horario => `
          <button
            type="button"
            class="botao-horario"
            data-horario="${horario}"
          >
            ${horario}
          </button>
        `).join("");
      }
    } catch (erro) {
      console.error("Erro ao buscar disponibilidade:", erro);
      if (orientacaoHorarios) {
        orientacaoHorarios.textContent = "Erro ao consultar horários. Verifique se o servidor backend está ativo.";
      }
      if (listaHorarios) listaHorarios.innerHTML = "";
    }
  });

  if (listaHorarios) {
    listaHorarios.addEventListener("click", evento => {
      const botao = evento.target.closest(".botao-horario");
      if (!botao) return;

      horarioSelecionado = botao.dataset.horario;

      listaHorarios.querySelectorAll(".botao-horario").forEach(b => {
        b.classList.remove("selecionado");
      });
      botao.classList.add("selecionado");

      if (resumoHorario && horarioEscolhido) {
        const partes = dataSelecionada.split("-");
        const dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
        horarioEscolhido.textContent = `${dataFormatada} às ${horarioSelecionado}`;
        resumoHorario.hidden = false;
      }

      // Atualiza também a data e horário no card lateral de resumo
      const resumoLateral = document.querySelector("#resumo-data-hora-lateral");
      const resumoLateralTexto = document.querySelector("#resumo-data-hora-texto");
      if (resumoLateral && resumoLateralTexto) {
        const partes = dataSelecionada.split("-");
        const dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
        resumoLateralTexto.textContent = `${dataFormatada} às ${horarioSelecionado}`;
        resumoLateral.hidden = false;
      }

      if (mensagemHorario) mensagemHorario.textContent = "";
    });
  }

  if (botaoConfirmar) {
    botaoConfirmar.addEventListener("click", () => {
      if (
        !servicoSelecionadoId ||
        !dataSelecionada ||
        !horarioSelecionado
      ) {
        if (mensagemHorario) {
          mensagemHorario.textContent = "Selecione uma data e um horário antes de continuar.";
        }
        return;
      }

      navegarParaEtapa("cliente");
      const erroForm = document.querySelector("#erro-formulario");
      if (erroForm) erroForm.textContent = "";
      document.querySelector("#nome-cliente")?.focus();
    });
  }
}

function formatarMascaraTelefone(valor) {
  let digitos = valor.replace(/\D/g, "");

  // Se o usuário colar com código internacional (+55), remove o 55 inicial
  if (digitos.length > 11 && digitos.startsWith("55")) {
    digitos = digitos.slice(2);
  }

  // Limita a no máximo 11 dígitos (DDD + 9 dígitos)
  digitos = digitos.slice(0, 11);

  if (digitos.length === 0) return "";
  if (digitos.length <= 2) return `(${digitos}`;
  if (digitos.length <= 7) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
  if (digitos.length <= 10) {
    // Se for telefone fixo (10 dígitos e o 3º dígito não for 9)
    if (digitos.length === 10 && digitos[2] !== "9") {
      return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
    }
    // Celular digitando aos poucos
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
  }
  // 11 dígitos completo (celular brasileiro)
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7, 11)}`;
}

function configurarMascaraTelefone() {
  const campoTelefone = document.querySelector("#telefone-cliente");
  if (!campoTelefone) return;

  const aplicarMascara = () => {
    campoTelefone.value = formatarMascaraTelefone(campoTelefone.value);
  };

  campoTelefone.addEventListener("input", aplicarMascara);
  campoTelefone.addEventListener("paste", () => {
    setTimeout(aplicarMascara, 0);
  });
  campoTelefone.addEventListener("blur", aplicarMascara);
}

function formatarValidacaoNome(valor) {
  // Mantém apenas letras (incluindo acentos e cedilha) e espaços, com no máximo 50 caracteres
  return valor.replace(/[^a-zA-ZÀ-ÖØ-öø-ÿ\s]/g, "").slice(0, 50);
}

function configurarValidacaoNome() {
  const campoNome = document.querySelector("#nome-cliente");
  const erroFormulario = document.querySelector("#erro-formulario");
  if (!campoNome) return;

  const sanitizar = () => {
    const valorOriginal = campoNome.value;
    const valorLimpo = formatarValidacaoNome(valorOriginal);

    if (valorOriginal !== valorLimpo) {
      campoNome.value = valorLimpo;
      if (erroFormulario) {
        erroFormulario.textContent = "Números e caracteres especiais não são permitidos no nome.";
        setTimeout(() => {
          if (erroFormulario.textContent.includes("Números e caracteres especiais")) {
            erroFormulario.textContent = "";
          }
        }, 3000);
      }
    }
  };

  campoNome.addEventListener("input", sanitizar);
  campoNome.addEventListener("paste", () => {
    setTimeout(sanitizar, 0);
  });
  campoNome.addEventListener("blur", sanitizar);
}

document.addEventListener("DOMContentLoaded", () => {
  const elementoAno = document.querySelector("#ano");

  if (elementoAno) {
    elementoAno.textContent = new Date().getFullYear();
  }
  carregarServicos();
  configurarCalendario();
  configurarMascaraTelefone();
  configurarValidacaoNome();

  const lista = document.querySelector("#lista-servicos");
  if (lista) {
    lista.addEventListener("click", evento => {
      const card = evento.target.closest(".servico");
      if (!card) return;
      selecionarServico(Number(card.dataset.cardId));
    });

    lista.addEventListener("keydown", evento => {
      if (evento.key === "Enter" || evento.key === " ") {
        const card = evento.target.closest(".servico");
        if (card) {
          evento.preventDefault();
          selecionarServico(Number(card.dataset.cardId));
        }
      }
    });
  }

  const botaoContinuar = document.querySelector("#continuar-agendamento");
  if (botaoContinuar) {
    botaoContinuar.addEventListener("click", () => {
      if (servicoSelecionadoId === null) return;

      const etapaCliente = document.querySelector("#etapa-cliente");
      const etapaRevisao = document.querySelector("#etapa-revisao");

      // Cenário 1: Se o usuário já está na etapa de dados do cliente, valida e avança para a revisão
      if (etapaCliente && !etapaCliente.hidden) {
        const formCliente = document.querySelector("#form-cliente");
        if (formCliente) {
          formCliente.requestSubmit();
        }
        return;
      }

      // Cenário 2: Se o usuário já está na etapa de revisão, dispara a confirmação do agendamento
      if (etapaRevisao && !etapaRevisao.hidden) {
        const btnConfirmar = document.querySelector("#btn-confirmar-agendamento");
        if (btnConfirmar && !btnConfirmar.disabled) {
          btnConfirmar.click();
        }
        return;
      }

      // Cenário 3: Usuário está na etapa de data/horário
      // Se já escolheu a data e o horário, avança para os dados do cliente
      if (dataSelecionada && horarioSelecionado) {
        const msg = document.querySelector("#mensagem-selecao");
        if (msg) msg.textContent = "";
        navegarParaEtapa("cliente");
        document.querySelector("#nome-cliente")?.focus();
        return;
      }

      // Se ainda não escolheu data e horário, mantém na etapa de agendamento e orienta o usuário
      navegarParaEtapa("agendamento");
      const campoData = document.querySelector("#data-agendamento");
      if (campoData) {
        campoData.focus();
      }

      const msg = document.querySelector("#mensagem-selecao");
      if (msg) {
        msg.textContent = "Selecione uma data e um horário ao lado para continuar.";
      }
    });
  }

  // Botão para voltar à escolha de horários a partir dos dados do cliente
  const btnVoltarHorarios = document.querySelector("#btn-voltar-horarios");
  if (btnVoltarHorarios) {
    btnVoltarHorarios.addEventListener("click", () => {
      navegarParaEtapa("agendamento");
    });
  }

  // Botão para voltar aos dados do cliente a partir da revisão
  const btnVoltarDados = document.querySelector("#btn-voltar-dados");
  if (btnVoltarDados) {
    btnVoltarDados.addEventListener("click", () => {
      navegarParaEtapa("cliente");
    });
  }

  // Botão para trocar serviço e rolar de volta para o catálogo
  const btnTrocarServico = document.querySelector("#btn-trocar-servico");
  if (btnTrocarServico) {
    btnTrocarServico.addEventListener("click", (e) => {
      e.preventDefault();
      const secaoServicos = document.querySelector("#servicos");
      if (secaoServicos) {
        secaoServicos.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }
    });
  }

  const formularioCliente = document.querySelector("#form-cliente");

  formularioCliente.addEventListener("submit", evento => {
    evento.preventDefault();

    if (
      !servicoSelecionadoId ||
      !dataSelecionada ||
      !horarioSelecionado
    ) {
      document.querySelector("#erro-formulario").textContent =
        "Volte e selecione um serviço, uma data e um horário.";
      return;
    }

    const hoje = obterDataHojeLocal();
    const dataLimite = obterDataLimiteLocal(4);

    if (dataSelecionada < hoje || dataSelecionada > dataLimite) {
      const [aL, mL, dL] = dataLimite.split("-");
      document.querySelector("#erro-formulario").textContent =
        `A data de agendamento deve ser entre hoje e no máximo 4 meses à frente (até ${dL}/${mL}/${aL}).`;
      return;
    }

    if (!formularioCliente.reportValidity()) return;

    const servico = servicos.find(
      item => item.id === servicoSelecionadoId
    );

    if (!servico) return;

    const campoNome = document.querySelector("#nome-cliente");
    const nome = campoNome ? campoNome.value.trim() : "";
    const telefone = document.querySelector("#telefone-cliente").value.trim();

    if (nome.length < 3 || nome.length > 50) {
      document.querySelector("#erro-formulario").textContent =
        "O nome do cliente deve conter entre 3 e 50 caracteres.";
      campoNome?.focus();
      return;
    }

    const regexApenasLetras = /^[A-Za-zÀ-ÖØ-öø-ÿ\s]+$/;
    if (!regexApenasLetras.test(nome)) {
      document.querySelector("#erro-formulario").textContent =
        "O nome não pode conter números ou caracteres especiais. Digite apenas letras.";
      campoNome?.focus();
      return;
    }

    document.querySelector("#revisao-nome").textContent = nome;
    document.querySelector("#revisao-telefone").textContent = telefone;
    document.querySelector("#revisao-servico").textContent = servico.nome;
    document.querySelector("#revisao-data").textContent =
      dataSelecionada.split("-").reverse().join("/");
    document.querySelector("#revisao-horario").textContent =
      horarioSelecionado;
    document.querySelector("#revisao-duracao").textContent =
      formatarDuracao(servico.duracao);
    document.querySelector("#revisao-preco").textContent =
      formatarPreco(servico.preco);

    // Prepara a seção de revisão e garante que o botão esteja visível
    const btnConfirmar = document.querySelector("#btn-confirmar-agendamento");
    const statusAgendamento = document.querySelector("#status-agendamento");
    const cardSucesso = document.querySelector("#sucesso-agendamento");

    if (btnConfirmar) {
      btnConfirmar.hidden = false;
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "ENVIAR SOLICITAÇÃO DE AGENDAMENTO";
    }
    if (statusAgendamento) statusAgendamento.textContent = "";
    if (cardSucesso) cardSucesso.hidden = true;

    navegarParaEtapa("revisao");
  });

  const btnConfirmar = document.querySelector("#btn-confirmar-agendamento");
  const statusAgendamento = document.querySelector("#status-agendamento");
  const cardSucesso = document.querySelector("#sucesso-agendamento");
  const btnNovoAgendamento = document.querySelector("#btn-novo-agendamento");

  if (btnConfirmar) {
    btnConfirmar.addEventListener("click", async () => {
      const nome = document.querySelector("#nome-cliente")?.value.trim();
      const telefone = document.querySelector("#telefone-cliente")?.value.trim();

      if (!servicoSelecionadoId || !dataSelecionada || !horarioSelecionado || !nome || !telefone) {
        if (statusAgendamento) {
          statusAgendamento.textContent = "Dados incompletos. Por favor, revise todos os passos.";
          statusAgendamento.style.color = "#E6B8A8";
        }
        return;
      }

      btnConfirmar.disabled = true;
      btnConfirmar.textContent = "Enviando solicitação de agendamento...";
      if (statusAgendamento) statusAgendamento.textContent = "";

      try {
        const resposta = await fetch(`${API_URL}/bookings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            serviceId: servicoSelecionadoId,
            clientName: nome,
            clientPhone: telefone,
            date: dataSelecionada,
            time: horarioSelecionado
          })
        });

        const resultado = await resposta.json();

        if (resposta.status === 201) {
          // Preenche os dados no comprovante da etapa de sucesso
          const campoSucessoNome = document.querySelector("#sucesso-nome");
          if (campoSucessoNome) campoSucessoNome.textContent = nome;

          const campoSucessoTelefone = document.querySelector("#sucesso-telefone");
          if (campoSucessoTelefone) campoSucessoTelefone.textContent = resultado.dados?.telefone || telefone;

          const campoSucessoServico = document.querySelector("#sucesso-servico");
          if (campoSucessoServico) campoSucessoServico.textContent = document.querySelector("#revisao-servico")?.textContent || "";

          const campoSucessoData = document.querySelector("#sucesso-data");
          if (campoSucessoData) campoSucessoData.textContent = document.querySelector("#revisao-data")?.textContent || "";

          const campoSucessoHorario = document.querySelector("#sucesso-horario");
          if (campoSucessoHorario) campoSucessoHorario.textContent = document.querySelector("#revisao-horario")?.textContent || "";

          const campoSucessoValor = document.querySelector("#sucesso-valor");
          if (campoSucessoValor) campoSucessoValor.textContent = document.querySelector("#revisao-preco")?.textContent || "";

          const campoSucessoStatus = document.querySelector("#sucesso-status");
          if (campoSucessoStatus) campoSucessoStatus.textContent = resultado.dados?.status || "PENDENTE";

          // Ajusta os elementos do card lateral da esquerda para refletir a conclusão
          const btnContinuarLateral = document.querySelector("#continuar-agendamento");
          if (btnContinuarLateral) btnContinuarLateral.style.display = "none";

          const btnTrocarLateral = document.querySelector("#btn-trocar-servico");
          if (btnTrocarLateral) btnTrocarLateral.style.display = "none";

          const msgLateral = document.querySelector("#mensagem-selecao");
          if (msgLateral) {
            msgLateral.textContent = "✓ Solicitação enviada! Aguardando aprovação.";
            msgLateral.style.color = "#f7d584";
          }

          // Mostra o card de Solicitação Enviada (Aguardando Aprovação)
          navegarParaEtapa("sucesso");
        } else if (resposta.status === 409) {
          btnConfirmar.disabled = false;
          btnConfirmar.textContent = "ENVIAR SOLICITAÇÃO DE AGENDAMENTO";
          if (statusAgendamento) {
            statusAgendamento.textContent = resultado.mensagem || "Este horário acabou de ser reservado por outro cliente. Por favor, volte e escolha outro horário.";
            statusAgendamento.style.color = "#E6B8A8";
          }
        } else {
          btnConfirmar.disabled = false;
          btnConfirmar.textContent = "ENVIAR SOLICITAÇÃO DE AGENDAMENTO";
          if (statusAgendamento) {
            statusAgendamento.textContent = resultado.mensagem || "Não foi possível enviar a solicitação. Tente novamente.";
            statusAgendamento.style.color = "#E6B8A8";
          }
        }
      } catch (erro) {
        console.error("Erro ao enviar solicitação de agendamento:", erro);
        btnConfirmar.disabled = false;
        btnConfirmar.textContent = "ENVIAR SOLICITAÇÃO DE AGENDAMENTO";
        if (statusAgendamento) {
          statusAgendamento.textContent = "Erro de conexão com o servidor. Verifique se o backend está ativo.";
          statusAgendamento.style.color = "#E6B8A8";
        }
      }
    });
  }

  if (btnNovoAgendamento) {
    btnNovoAgendamento.addEventListener("click", () => {
      window.location.href = window.location.pathname;
    });
  }

  // Se o painel já estiver aberto, direciona direto para ele; senão, leva para a lista de serviços
  document.querySelectorAll('a[href="#servicos"]').forEach(link => {
    link.addEventListener("click", (e) => {
      const painel = document.querySelector("#painel-agendamento");
      if (painel && !painel.hidden && link.id !== "btn-trocar-servico") {
        e.preventDefault();
        painel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });

  // Botão flutuante para voltar ao topo automaticamente
  const btnVoltarTopo = document.querySelector("#btn-voltar-topo");
  if (btnVoltarTopo) {
    const alternarBotaoTopo = () => {
      if (window.scrollY > 300) {
        btnVoltarTopo.classList.add("visivel");
      } else {
        btnVoltarTopo.classList.remove("visivel");
      }
    };

    window.addEventListener("scroll", alternarBotaoTopo, { passive: true });
    alternarBotaoTopo();

    btnVoltarTopo.addEventListener("click", () => {
      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    });
  }
});

