# 💈 Rossi Barbershop

> Sistema web moderno de agendamento online e gestão para barbearia com integração e confirmação via WhatsApp.

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
* **Banco de Dados:** PostgreSQL com restrições de integridade relacional.
* **ORM:** Prisma ORM para modelagem, migrações e consultas tipadas.

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
