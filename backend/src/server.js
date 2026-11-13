require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const realtime = require("./realtime");
const graphService = require("./services/graphService");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app); // one server for the API and Socket.IO

graphService.loadGraph();

// Live incident updates on the same port, e.g. io("http://localhost:5000")
realtime.init(new Server(server, { cors: { origin: "*" } }));

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT} (API + Socket.IO)`);
});
