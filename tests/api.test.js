/**
 * =========================================================================
 * Rossi Barbershop - Suíte de Testes Automatizados de API (QA)
 * =========================================================================
 * 
 * Cenários de Teste:
 * 1. Healthcheck e integridade da API
 * 2. [Cenário Positivo] Agendamento em horário livre (201 Created)
 * 3. [Cenário Negativo] Prevenção de Overbooking / Agendamento duplicado (409 Conflict)
 * 4. [Segurança & Autorização] Bloqueio de rota administrativa sem autenticação (401 Unauthorized)
 * 5. [Gestão Administrativa] Aprovação de solicitação pelo Barbeiro (200 OK -> CONFIRMADO)
 * 6. [Gestão Administrativa] Recusa de solicitação pelo Barbeiro (200 OK -> RECUSADO)
 * 7. [Validação de Dados] Rejeição de requisição com telefone inválido (400 Bad Request)
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

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

describe("💈 Rossi Barbershop - API Test Suite (QA)", () => {
  let createdBookingId = null;
  let secondBookingId = null;

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
    // Cria segundo agendamento para teste de recusa
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

    // Executa a recusa administrativa
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
      time: "16:00",
      clientName: "Cliente Telefone Invalido",
      clientPhone: "12345" // Telefone curto demais
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
});
