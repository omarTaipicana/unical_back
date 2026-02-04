// server.js
require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app"); // tu Express app
const sequelize = require("./utils/connection");
const sequelizeM = require("./utils/connectionM");

const PORT = process.env.PORT || 8082;

const main = async () => {
  try {
    // Sincronizar bases de datos
    await sequelize.sync();
    await sequelizeM.sync();
    console.log("DB connected");
    console.log("DBM connected");

    // Crear servidor HTTP
    const server = http.createServer(app);

    // Crear instancia de Socket.IO
    const io = new Server(server, {
      cors: {
        origin: "*", // O la URL de tu frontend: "http://localhost:5173"
        methods: ["GET", "POST", "PUT", "DELETE"],
      },
    });

    // Guardar io en app para que las rutas lo puedan usar
    app.set("io", io);

    // Eventos de Socket.IO
    io.on("connection", (socket) => {
      console.log("Nuevo cliente conectado:", socket.id);

      socket.on("disconnect", () => {
        console.log("Cliente desconectado:", socket.id);
      });
    });

    // Iniciar servidor
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Error al iniciar servidor:", error);
  }
};

main();
