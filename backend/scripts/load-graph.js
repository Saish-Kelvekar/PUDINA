require("dotenv").config();
const { pool } = require("../src/config/db");
const graphService = require("../src/services/graphService");

(async () => {
  graphService.loadGraph();
  const g = graphService.getGraph();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const n of g.nodes) {
      await client.query(
        `INSERT INTO road_nodes (id, lat, lng, name, signalised) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET lat=$2, lng=$3, name=$4, signalised=$5`,
        [n.id, n.lat, n.lng, n.name, n.signalised]);
    }
    for (const e of g.edges) {
      await client.query(
        `INSERT INTO road_segments (id, from_node, to_node, name, length_m, road_type, lanes, free_flow_kmph, oneway, coords)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET from_node=$2, to_node=$3, name=$4, length_m=$5, road_type=$6,
           lanes=$7, free_flow_kmph=$8, oneway=$9, coords=$10`,
        [e.id, e.from, e.to, e.name, e.length_m, e.road_type, e.lanes, e.free_flow_kmph, e.oneway, JSON.stringify(e.coords)]);
    }
    for (const n of g.nodes.filter((x) => x.signalised)) {
      await client.query(
        `INSERT INTO junctions (id, node_id, name) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=$3`,
        ["J-" + n.id, n.id, n.name]);
    }
    await client.query("COMMIT");
    console.log("Saved to database: nodes, segments, junctions");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Load failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();