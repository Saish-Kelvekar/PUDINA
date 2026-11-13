// Throw this anywhere: throw new AppError(401, "UNAUTHORIZED", "Wrong email or password")
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
module.exports = AppError;