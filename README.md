# 💈 Rossi Barbershop

> Sistema web moderno de agendamento online e gestão para barbearia com confirmação via WhatsApp e suíte de testes automatizados de API (QA).

![Rossi Barbershop Preview](img/preview.jpg)

---

## 📌 Sobre o Projeto

O **Rossi Barbershop** é uma solução completa desenvolvida para automatizar e profissionalizar o atendimento da barbearia. Ele elimina o atrito de combinações manuais de horários por mensagens, permitindo que os próprios clientes verifiquem a disponibilidade em tempo real e garantam o seu lugar na cadeira.

* **Agendamento em 3 etapas simples:** Escolha do serviço, seleção de data no calendário e escolha de horário livre.
* **Prevenção de Overbooking:** Restrição exclusiva no banco de dados que impede agendamentos duplicados no mesmo dia e horário.
* **Confirmação via WhatsApp:** Gera automaticamente mensagem formatada com os detalhes do agendamento para contato direto com o barbeiro.
* **Painel Administrativo Interno:** Gestão de agendamentos (confirmar, recusar, concluir), base de clientes e controle de fluxo financeiro (receitas e despesas).

---

## 🛠️ Tecnologias Utilizadas (Stack)

* **Frontend:** HTML5 semântico, CSS3 moderno (*dark luxury theme* com detalhes em dourado, responsivo para mobile e desktop) e JavaScript puro (ES6+).
* **Backend:** Node.js com Express 5.
* **Banco de Dados:** PostgreSQL com restrições relacionais de integridade.
* **ORM:** Prisma ORM para modelagem, migrações e consultas tipadas.
* **Testes & QA:** Node Test Runner nativo (`node:test`), asserções estritas (`node:assert`) e coleção Postman v2.1.0 para testes de regressão de API.

---

## 🧪 Qualidade de Software & Testes Automatizados (QA)

O projeto conta com uma suíte de testes de API automatizados cobrindo fluxos críticos de negócio, regras de integridade e segurança de ponta a ponta:

| ID | Cenário de Teste | Endpoint | Status Esperado | Validação QA |
| :---: | :--- | :--- | :---: | :--- |
| **CT-01** | **Healthcheck** | `GET /api/health` | `200 OK` | Disponibilidade do serviço |
| **CT-02** | **Happy Path** | `POST /api/bookings` | `201 Created` | Reserva criada com status inicial `PENDENTE` |
| **CT-03** | **Prevenção de Overbooking** | `POST /api/bookings` | `409 Conflict` | Impede agendamento duplicado no mesmo dia/horário |
| **CT-04** | **Segurança & RBAC** | `PATCH /api/bookings/:id/approve` | `401 Unauthorized` | Bloqueia ação de admin sem a chave de acesso |
| **CT-05** | **Aprovação pelo Admin** | `PATCH /api/bookings/:id/approve` | `200 OK` | Transição de status para `CONFIRMADO` |
| **CT-06** | **Recusa pelo Admin** | `PATCH /api/bookings/:id/reject` | `200 OK` | Transição para `RECUSADO` com justificativa e horário liberado |
| **CT-07** | **Validação de Payload** | `POST /api/bookings` | `400 Bad Request` | Rejeição de número de celular inválido |

### **Como Executar os Testes Automatizados**

#### Opção A: Executar via CLI (Nativo do Node.js)
```bash
npm test
```

#### Opção B: Executar via Postman / Newman (CLI)
A pasta [`postman/`](postman/) contém a coleção e as variáveis de ambiente prontas para uso:
```bash
npx newman run postman/Rossi_Barbershop_API.postman_collection.json -e postman/Rossi_Barbershop.postman_environment.json
```
*(Você também pode importar os arquivos JSON diretamente no aplicativo desktop do Postman e rodar o Collection Runner).*

---

## 🚀 Como Rodar o Projeto Localmente

### **Pré-requisitos**
* [Node.js](https://nodejs.org/) (versão 18 ou superior)
* [PostgreSQL](https://www.postgresql.org/) instalado localmente ou banco em nuvem (ex: Supabase, Neon)

### **1. Configurar o Backend**
Acesse o diretório do backend e instale os pacotes:
```bash
cd backend
npm install
```

Crie o arquivo `.env` com base no `.env.example`:
```bash
# No Windows PowerShell:
Copy-Item .env.example .env

# No Linux/Mac:
cp .env.example .env
```

Abra o arquivo `.env` e configure sua conexão com o PostgreSQL:
```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/rossi_barbershop?schema=public"
PORT=3000
ADMIN_API_KEY="sua_chave_secreta_aqui"
```

Aplique as migrações no banco de dados e popule os serviços iniciais:
```bash
npx prisma migrate dev
node prisma/seed.js
```

Inicie o servidor:
```bash
node src/server.js
```

### **2. Acessar a Aplicação**
O backend já serve os arquivos do frontend estático automaticamente. Com o servidor rodando, basta abrir no navegador:

* **Site de Agendamento (Público):** `http://localhost:3000`
* **Painel do Barbeiro (Admin):** `http://localhost:3000/admin.html`

---

## 👨‍💻 Autor
Desenvolvido por **Ashiley Menezes**.
