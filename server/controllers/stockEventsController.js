const { addClient, removeClient } = require('../services/stockBroadcast');

// GET /api/stock-events — a long-lived SSE stream of stock_update frames.
// Protected the same way as every other route; the client reads it via
// fetch() with a normal Authorization header rather than native EventSource
// (which can't set custom headers), specifically to avoid ever putting the
// access token in a URL where it could leak into logs/proxies/history.
exports.streamStockEvents = (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(': connected\n\n');

  addClient(res);
  req.on('close', () => removeClient(res));
};
