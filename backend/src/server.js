require("dotenv").config();
const http = require("http");
const app = require("./app");

const PORT = process.env.PORT || 5000;
const server = http.createServer(app); // plain http server, so Socket.IO can join it in Phase 4

server.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});