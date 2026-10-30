/**
 * =========================================================================
 * Rossi Barbershop - Suíte de Testes Automatizados de API e Segurança (QA)
 * =========================================================================
 * 
 * Cenários Cobertos:
 * 1. Healthcheck e integridade da API
 * 2. [Cenário Positivo] Agendamento em horário livre (201 Created)
 * 3. [Cenário Negativo] Prevenção de Overbooking / Agendamento duplicado (409 Conflict)
 * 4. [Segurança & Autorização] Bloqueio de rota administrativa sem autenticação (401 Unauthorized)
 * 5. [Gestão Administrativa] Aprovação de solicitação pelo Barbeiro (200 OK -> CONFIRMADO)
 * 6. [Gestão Administrativa] Recusa de solicitação pelo Barbeiro (200 OK -> RECUSADO)
 * 7. [Validação de Dados] Rejeição de requisição com telefone inválido (400 Bad Request)
 * 
 * --- AUDITORIA DE SEGURANÇA (Seção 6) ---
 * 8. [Segurança: Credencial Inválida] Rejeição de login com chave incorreta (401 Unauthorized)
 * 9. [Segurança: Rate Limiting] Bloqueio de tentativas repetidas de brute-force (429 Too Many Requests)
 * 10. [Segurança: Sessão/Token] Login gera token temporário válido com expiração
 * 11. [Segurança: Token Expirado] Rejeição de requisição com token de sessão expirado (401 Unauthorized)
 * 12. [Segurança: Logout & Revogação] Logout invalida imediatamente o token no servidor
 * 13. [Segurança: Módulo Financeiro] Bloqueio de acesso a dados financeiros sem autenticação (401 Unauthorized)
 * 14. [Segurança: Anti-XSS] Rejeição de injeção de scripts HTML/JS em campos de cadastro (400 Bad Request)
 * 15. [Segurança: DoS Payload] Rejeição de requisição com tamanho superior a 50KB (413 Payload Too Large)
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const crypto = require("crypto");

// Carrega variáveis de ambiente do backend
require(path.join(__dirname, "../backend/node_modules/dotenv")).config({ path: path.join(__dirname, "../backend/.env") });

const app = require("../backend/src/app");
const prisma = require("../backend/src/lib/prisma");

let server;
let baseUrl;
const ADMIN_KEY = process.env.ADMIN_API_KEY || "chave_secreta_admin_rossi_barbershop";

// Dados de teste com data futura válida (próxima quinta-feira)
function obterDataQuintaFeiraFutura() {
  const d = new Date();
  d.setDate(d.getDate() + ((4 + 7 - d.getDay()) % 7 || 7));
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

const TEST_DATE = obterDataQuintaFeiraFutura();
const TEST_TIME = "14:15";
const TEST_TIME_2 = "15:00";
const TEST_PHONE = "(19) 99999-8888";

describe("💈 Rossi Barbershop - Suíte Completa de Testes de API & Segurança (QA)", () => {
  let createdBookingId = null;
  let secondBookingId = null;
  let activeSessionToken = null;

  before(async () => {
    // Limpeza de testes anteriores para garantir idempotência
    await prisma.transaction.deleteMany({
      where: { booking: { clientPhone: TEST_PHONE } }
    }).catch(() => {});

    await prisma.booking.deleteMany({
      where: {
        OR: [
          { clientPhone: TEST_PHONE },
          { date: TEST_DATE, time: { in: [TEST_TIME, TEST_TIME_2] } }
        ]
      }
    }).catch(() => {});

    // Inicia servidor em porta efêmera aleatória para testes
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}/api`;
        resolve();
      });
    });
  });

  after(async () => {
    // Teardown: Limpeza dos agendamentos de teste
    await prisma.transaction.deleteMany({
      where: { booking: { clientPhone: TEST_PHONE } }
    }).catch(() => {});

    await prisma.booking.deleteMany({
      where: { clientPhone: TEST_PHONE }
    }).catch(() => {});

    await prisma.$disconnect();

    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================
  // BLOCO 1: FLUXOS CRÍTICOS DE AGENDAMENTO
  // ==========================================

  test("1. [GET /api/health] - Deve responder com status 200 e confirmação de operação", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.match(body.mensagem, /Rossi Barbershop/);
  });

  test("2. [POST /api/bookings] - [Happy Path] Deve agendar serviço em horário livre com sucesso", async () => {
    const payload = {
      serviceId: 1,
      date: TEST_DATE,
      time: TEST_TIME,
      clientName: "Cliente Teste QA",
      clientPhone: TEST_PHONE
    };

    const res = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    assert.equal(res.status, 201, "Status code deve ser 201 Created");
    const body = await res.json();

    assert.equal(body.sucesso, true);
    assert.ok(body.dados.id, "Deve retornar o ID do agendamento");
    assert.equal(body.dados.status, "PENDENTE", "Novo agendamento deve iniciar como PENDENTE");
    assert.equal(body.dados.data, TEST_DATE);
    assert.equal(body.dados.horario, TEST_TIME);

    createdBookingId = body.dados.id;
  });

  test("3. [POST /api/bookings] - [Overbooking] Deve rejeitar agendamento duplicado no mesmo dia e horário", async () => {
    const payloadDuplicado = {
      serviceId: 1,
      date: TEST_DATE,
      time: TEST_TIME,
      clientName: "Outro Cliente Tentando Conflito",
      clientPhone: "(19) 98888-7777"
    };

    const res = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadDuplicado)
    });

    assert.equal(res.status, 409, "Status code deve ser 409 Conflict para impedir reservas sobrepostas");
    const body = await res.json();
    assert.equal(body.sucesso, false);
    assert.match(body.mensagem, /conflita com outro atendimento|reservado por outro cliente/i);
  });

  test("4. [PATCH /api/bookings/:id/approve] - [Segurança] Deve bloquear aprovação sem credenciais de admin", async () => {
    assert.ok(createdBookingId, "ID do agendamento deve existir");

    const res = await fetch(`${baseUrl}/bookings/${createdBookingId}/approve`, {
      method: "PATCH"
    });

    assert.equal(res.status, 401, "Status code deve ser 401 Unauthorized quando x-admin-key ausente");
    const body = await res.json();
    assert.equal(body.sucesso, false);
  });

  test("5. [PATCH /api/bookings/:id/approve] - [Admin] Deve permitir barbeiro aprovar agendamento com chave válida", async () => {
    assert.ok(createdBookingId, "ID do agendamento deve existir");

    const res = await fetch(`${baseUrl}/bookings/${createdBookingId}/approve`, {
      method: "PATCH",
      headers: {
        "x-admin-key": ADMIN_KEY
      }
    });

    assert.equal(res.status, 200, "Status code deve ser 200 OK");
    const body = await res.json();
    assert.equal(body.sucesso, true);
    assert.equal(body.dados.status, "CONFIRMADO", "Status deve transicionar de PENDENTE para CONFIRMADO");
  });

  test("6. [PATCH /api/bookings/:id/reject] - [Admin] Deve permitir barbeiro recusar agendamento com justificativa", async () => {
    const payload = {
      serviceId: 1,
      date: TEST_DATE,
      time: TEST_TIME_2,
      clientName: "Cliente Teste Recusa",
      clientPhone: TEST_PHONE
    };

    const createRes = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const createBody = await createRes.json();
    secondBookingId = createBody.dados.id;

    const res = await fetch(`${baseUrl}/bookings/${secondBookingId}/reject`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-admin-key": ADMIN_KEY
      },
      body: JSON.stringify({ motivo: "Horário reservado para manutenção preventiva" })
    });

    assert.equal(res.status, 200, "Status code deve ser 200 OK");
    const body = await res.json();
    assert.equal(body.sucesso, true);
    assert.equal(body.dados.status, "RECUSADO", "Status deve transicionar para RECUSADO");
  });

  test("7. [POST /api/bookings] - [Validação de Dados] Deve rejeitar requisição com telefone inválido", async () => {
    const payloadInvalido = {
      serviceId: 1,
      date: TEST_DATE,
      time: "16:30",
      clientName: "Cliente Telefone Invalido",
      clientPhone: "12345"
    };

    const res = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadInvalido)
    });

    assert.equal(res.status, 400, "Status code deve ser 400 Bad Request");
    const body = await res.json();
    assert.equal(body.sucesso, false);
    assert.match(body.mensagem, /telefone celular válido/i);
  });

  // ==========================================
  // BLOCO 2: AUDITORIA DE SEGURANÇA (SEÇÃO 6)
  // ==========================================

  test("8. [POST /api/admin/login] - [Segurança] Deve rejeitar login com credencial inválida (401)", async () => {
    const res = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "10.0.88.1"
      },
      body: JSON.stringify({ chaveAcesso: "chave_completamente_incorreta_123" })
    });

    assert.equal(res.status, 401, "Status code deve ser 401 Unauthorized");
    const body = await res.json();
    assert.equal(body.sucesso, false);
    assert.match(body.mensagem, /Chave de acesso administrativa inválida/i);
  });

  test("9. [POST /api/admin/login] - [Segurança: Rate Limiting] Deve bloquear após tentativas repetidas de brute-force", async () => {
    const ipSpoof = "10.0.99.1"; // IP específico de teste
    // Executa tentativas de login inválido sequenciais
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": ipSpoof
        },
        body: JSON.stringify({ chaveAcesso: `tentativa_errada_${i}` })
      });
    }

    // A 6ª tentativa deve ser terminantemente bloqueada por Rate Limiting
    const resBloqueado = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": ipSpoof
      },
      body: JSON.stringify({ chaveAcesso: "tentativa_apos_limite" })
    });

    assert.equal(resBloqueado.status, 429, "Status code deve ser 429 Too Many Requests");
    const body = await resBloqueado.json();
    assert.equal(body.sucesso, false);
    assert.match(body.mensagem, /Muitas tentativas incorretas/i);
  });

  test("10. [POST /api/admin/login] - [Segurança: Sessão] Login com chave correta gera token de sessão temporário", async () => {
    const res = await fetch(`${baseUrl}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chaveAcesso: ADMIN_KEY })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.sucesso, true);
    assert.ok(body.token, "Deve retornar um token de sessão");
    assert.match(body.token, /^rossi_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, "Token deve ser assinado e estruturado");

    activeSessionToken = body.token;
  });

  test("11. [GET /api/admin/verify] - [Segurança: Token Expirado] Deve rejeitar requisição com token expirado (401)", async () => {
    // Forja um token assinado com timestamp de expiração no passado (exp: agora - 1 hora)
    const payloadExpirado = {
      jti: "token_forjado_expirado",
      iat: Date.now() - 7200000,
      exp: Date.now() - 3600000, // Expirado há 1 hora
      role: "ADMIN"
    };

    const payloadBase64 = Buffer.from(JSON.stringify(payloadExpirado)).toString("base64url");
    const signature = crypto
      .createHmac("sha256", ADMIN_KEY)
      .update(payloadBase64)
      .digest("base64url");
    const expiredToken = `rossi_${payloadBase64}.${signature}`;

    const res = await fetch(`${baseUrl}/admin/verify`, {
      headers: {
        "x-admin-key": expiredToken
      }
    });

    assert.equal(res.status, 401, "Token expirado deve ser rejeitado com 401");
    const body = await res.json();
    assert.equal(body.sucesso, false);
    assert.match(body.mensagem, /expirado/i);
  });

  test("12. [POST /api/admin/logout] - [Segurança: Logout] Logout deve invalidar imediatamente o token no servidor", async () => {
    assert.ok(activeSessionToken, "Deve possuir um token de sessão ativo");

    // 1. Executa o logout
    const logoutRes = await fetch(`${baseUrl}/admin/logout`, {
      method: "POST",
      headers: {
        "x-admin-key": activeSessionToken
      }
    });

    assert.equal(logoutRes.status, 200, "Logout deve retornar 200 OK");

    // 2. Tenta usar o mesmo token logo após o logout
    const verifyRes = await fetch(`${baseUrl}/admin/verify`, {
      headers: {
        "x-admin-key": activeSessionToken
      }
    });

    assert.equal(verifyRes.status, 401, "Token revogado via logout deve ser rejeitado com 401");
    const body = await verifyRes.json();
    assert.equal(body.sucesso, false);
    assert.match(body.mensagem, /logout|revogado|encerrada/i);
  });

  test("13. [GET /api/financial/*] - [Segurança: Dados Financeiros] Bloqueia acesso a finanças sem autenticação", async () => {
    const resSummary = await fetch(`${baseUrl}/financial/summary`);
    assert.equal(resSummary.status, 401, "Resumo financeiro não deve ser acessível sem autenticação");

    const resTransacoes = await fetch(`${baseUrl}/financial/transactions`);
    assert.equal(resTransacoes.status, 401, "Lista de transações financeiras não deve ser acessível sem autenticação");
  });

  test("14. [POST /api/bookings] - [Segurança: Anti-XSS] Rejeita tentativa de injeção de script em campos de texto", async () => {
    const payloadMalicioso = {
      serviceId: 1,
      date: TEST_DATE,
      time: "16:30",
      clientName: "<script>alert('xss')</script>",
      clientPhone: "(19) 99185-7275"
    };

    const res = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadMalicioso)
    });

    assert.equal(res.status, 400, "Injeção de tags HTML/scripts deve ser rejeitada pela validação de integridade");
    const body = await res.json();
    assert.equal(body.sucesso, false);
    assert.match(body.mensagem, /apenas letras e espaços/i);
  });

  test("15. [POST /api/bookings] - [Segurança: DoS Payload] Rejeita requisição com payload superior a 50KB (413)", async () => {
    const payloadGigante = {
      serviceId: 1,
      date: TEST_DATE,
      time: "17:15",
      clientName: "Cliente Teste",
      clientPhone: "(19) 99185-7275",
      observacoes: "A".repeat(60 * 1024) // 60 Kilobytes (acima do limite de 50KB)
    };

    const res = await fetch(`${baseUrl}/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadGigante)
    });

    assert.equal(res.status, 413, "Payload excessivo deve ser bloqueado com 413 Payload Too Large");
  });
});
