// Lets validation failures thrown inside a mongoose session.withTransaction()
// callback carry an HTTP status code back out to the route handler's catch
// block, instead of every failure collapsing to a generic 400/500.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = HttpError;
