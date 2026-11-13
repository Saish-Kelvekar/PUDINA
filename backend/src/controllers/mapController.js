const graphService = require("../services/graphService");
const { ok } = require("../utils/response");

function getGraph(req, res) {
  const g = graphService.getGraph();
  return ok(res, {
    nodes: g.nodes,
    edges: g.edges,
    node_count: g.nodes.length,
    edge_count: g.edges.length,
    source: "HISTORICAL",
    source_note: "Road network based on OpenStreetMap",
    generated_at: graphService.getLoadedAt(),
  });
}

module.exports = { getGraph };