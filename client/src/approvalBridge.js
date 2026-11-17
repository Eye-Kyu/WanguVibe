// Connects the axios interceptor (plain JS, outside React) to the
// <ApprovalPrompt /> modal (React). The interceptor calls requestApproval();
// the mounted modal registers itself as the handler and resolves with
// { username, pin } — or null if the cashier cancels.
let handler = null;

export function registerApprovalHandler(fn) {
    handler = fn;
    return () => { if (handler === fn) handler = null; };
}

export function requestApproval(message, { invalid = false } = {}) {
    if (!handler) return Promise.resolve(null);
    return handler({ message, invalid });
}
