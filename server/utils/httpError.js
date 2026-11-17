// Lets validation failures thrown inside a mongoose session.withTransaction()
// callback carry an HTTP status code back out to the route handler's catch
// block, instead of every failure collapsing to a generic 400/500.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// JSON body for an HttpError — includes `code` when the error carries one
// (e.g. APPROVAL_REQUIRED) so the client can react to it programmatically.
HttpError.body = (err) => (err.code && typeof err.code === 'string' ? { error: err.message, code: err.code } : { error: err.message });

module.exports = HttpError;
