// Numbers the whole backend agrees on. Change them here, not inside the code.
module.exports = {
  // Expected red-light wait at each signalised junction on a route.
  // Fixed stand-in until M3's /signals/optimize is connected (Phase 4).
  SIGNAL_WAIT_S: 20,

  // Extra seconds a verified incident adds to a road, by severity. A closure makes the road unusable.
  INCIDENT_PENALTY_S: { low: 60, medium: 180, high: 300 },

  // Default importance of each factor in the route score (Route Planner sliders)
  DEFAULT_WEIGHTS: { time: 0.35, distance: 0.15, congestion: 0.2, incidents: 0.15, fuel: 0.05, reliability: 0.1 },

  // Fuel: litres per km on a free road; congestion makes it up to 50% worse
  FUEL_L_PER_KM: 0.07,

  // When two route types give the same path, used roads get this much more expensive and we search again
  ALTERNATIVE_MULTIPLIER: 1.5,
  MAX_ALTERNATIVE_TRIES: 10,

  // A clicked source/destination must be this close to a junction, or we ask the user to click on the map's roads
  MAX_SNAP_DISTANCE_M: 300,
};