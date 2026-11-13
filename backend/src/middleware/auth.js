const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");

// Route needs a logged-in user
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Login required");
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, role }
    next();
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Invalid or expired token");
  }
}

// Route needs one of these roles, e.g. requireRole("admin")
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new AppError(403, "FORBIDDEN", `Needs role: ${roles.join(" or ")}`);
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };