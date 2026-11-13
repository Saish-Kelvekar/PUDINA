const test = require("node:test");
const assert = require("node:assert");
const realtime = require("../src/realtime");

test("emit before Socket.IO is set up does nothing (scripts and tests stay safe)", () => {
  assert.doesNotThrow(() => realtime.emit("incident:new", { incident: { id: 1 } }));
});

test("emit sends the event to every connected client", () => {
  const sent = [];
  realtime.init({ on() {}, emit: (ev, data) => sent.push([ev, data]) });
  realtime.emit("incident:verified", { incident: { id: 7 } });
  assert.deepStrictEqual(sent, [["incident:verified", { incident: { id: 7 } }]]);
});
