// Speed ratio = current speed / free-flow speed. Same thresholds as M3's CSV and the frontend colours.
function congestionLevel(ratio) {
  if (ratio === null || ratio === undefined || Number.isNaN(ratio)) return "no_data";
  if (ratio > 0.75) return "flowing";   // green
  if (ratio >= 0.5) return "moderate";  // yellow
  if (ratio >= 0.25) return "heavy";    // orange
  return "severe";                      // red
}

module.exports = { congestionLevel };
