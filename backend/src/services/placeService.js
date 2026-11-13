// Turns a lat/lng into something a person can read: the nearest named road and a map link.
// Uses the road graph that is already loaded in memory (no internet, no extra API).
const graphService = require("./graphService");
const { nearestSegment } = require("../utils/geo");

const MAX_ROAD_DISTANCE_M = 300; // further than this from any named road -> just give coordinates

let namedEdges = null;
let namedFor = null;
function getNamedEdges() {
  const g = graphService.getGraph();
  if (!g) return [];
  if (namedFor !== g) {
    namedEdges = g.edges.filter((e) => e.name);
    namedFor = g;
  }
  return namedEdges;
}

const mapsUrl = (lat, lng) => `https://maps.google.com/?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;

// segmentId (optional): the road the incident was snapped to. If it has a name, use it directly.
function describePlace(lat, lng, segmentId) {
  const place = { lat: Number(lat), lng: Number(lng), road: null, distance_m: null, maps_url: mapsUrl(lat, lng) };
  const own = segmentId ? graphService.getEdge(segmentId) : null;
  if (own && own.name) {
    place.road = own.name;
    place.distance_m = 0;
    return place;
  }
  const edges = getNamedEdges();
  if (!edges.length) return place;
  const { edge, distance_m } = nearestSegment(edges, place.lat, place.lng);
  if (edge && distance_m <= MAX_ROAD_DISTANCE_M) {
    place.road = edge.name;
    place.distance_m = distance_m;
  }
  return place;
}

module.exports = { describePlace, mapsUrl, MAX_ROAD_DISTANCE_M };
