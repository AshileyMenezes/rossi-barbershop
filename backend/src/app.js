require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

const healthRoutes = require("./routes/health.routes");
const servicesRoutes = require("./routes/services.routes");
const availabilityRoutes = require("./routes/availability.routes");
const bookingsRoutes = require("./routes/bookings.routes");
const adminRoutes = require("./routes/admin.routes");
const clientsRoutes = require("./routes/clients.routes");
const financialRoutes = require("./routes/financial.routes");

const app = express();

// Middlewares globais
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend (permite abrir http://localhost:3000/ e http://localhost:3000/admin.html)
app.use(express.static(path.join(__dirname, "../../")));

// Registro de rotas da API
app.use("/api/health", healthRoutes);
app.use("/api/services", servicesRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/bookings", bookingsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/clients", clientsRoutes);
app.use("/api/financial", financialRoutes);

module.exports = app;
