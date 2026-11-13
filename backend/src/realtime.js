// Live updates with Socket.IO. The server only sends; the frontend listens.
//   incident:new       { incident }  - someone reported an incident
//   incident:verified  { incident }  - an admin verified one (routes now avoid it)
let io = null;

function init(socketServer) {
  io = socketServer;
  io.on("connection", (socket) => {
    socket.emit("hello", { message: "TrafficVision live updates connected" });
  });
}

// Safe to call even if Socket.IO is not set up (e.g. in tests or scripts)
function emit(event, payload) {
  if (io) io.emit(event, payload);
}

module.exports = { init, emit };
