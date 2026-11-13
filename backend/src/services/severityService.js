// Estimates how serious an incident is from simple, explainable points.
// Every point is listed in `evidence`, so the admin sees why.
const CATEGORY_POINTS = { closure: 3, accident: 2, flooding: 2, roadwork: 1, breakdown: 1, event: 0, other: 0 };
const REPORTED_POINTS = { low: 0, medium: 1, high: 2 };

/**
 * category, isClosure, lanesBlocked, reportedSeverity : from the report
 * roadLanes  : lanes on the road it was reported on
 * speedRatio : current speed / free-flow on that road (null if no traffic data)
 */
function estimateSeverity({ category, isClosure, lanesBlocked, reportedSeverity, roadLanes, speedRatio }) {
  let points = 0;
  const evidence = [];
  const add = (p, text) => { if (p > 0) { points += p; evidence.push(`${text} (+${p})`); } };

  add(CATEGORY_POINTS[category] || 0, `Category ${category}`);
  if (isClosure) add(3, "Road closed");
  else if (lanesBlocked > 0) {
    add(lanesBlocked >= roadLanes ? 2 : 1, `${lanesBlocked} of ${roadLanes} lane(s) blocked`);
  }
  if (speedRatio !== null && speedRatio !== undefined && speedRatio < 0.5) {
    add(1, `Road already ${speedRatio < 0.25 ? "severe" : "heavy"}: speed ratio ${speedRatio.toFixed(2)}`);
  }
  add(REPORTED_POINTS[reportedSeverity] || 0, `Reported as ${reportedSeverity}`);

  const level = points >= 5 ? "high" : points >= 3 ? "medium" : "low";
  const confidence = Math.round(Math.min(0.95, 0.5 + 0.08 * evidence.length) * 100) / 100;
  return { level, confidence, evidence, points };
}

module.exports = { estimateSeverity };
