// Pushes stock-change events to every connected POS screen via SSE, so two
// cashiers see the same live count without a manual refresh. Single-instance
// only (the in-memory `clients` Set isn't shared across processes) — same
// known limitation already accepted for scheduledJobs.js; fine until this
// app actually runs more than one server instance.
const Variant = require('../models/Variant');
const { reportError } = require('../utils/reportError');
const { triggerWebhookEvent } = require('./webhooks');

const clients = new Set();

function addClient(res) {
  clients.add(res);
}

function removeClient(res) {
  clients.delete(res);
}

function broadcastStockChanges(changes) {
  if (!changes || changes.length === 0) return;
  const frame = `data: ${JSON.stringify({ type: 'stock_update', changes })}\n\n`;
  for (const res of clients) {
    res.write(frame);
  }
}

// The one function every stock-changing call site actually uses. Never
// trusts a locally-computed "old stock - quantity" guess — every mutation
// already runs inside a transaction using atomic $inc (or a plain save() for
// the one non-transactional case, restockVariant), so a local guess would be
// wrong under concurrent writes to the same variant. Re-reading fresh after
// the transaction has committed is the only way to guarantee the broadcast
// value is actually correct. Fire-and-forget by design — a broadcast hiccup
// must never fail the real business operation it's attached to, so callers
// invoke this without awaiting (or await + swallow, same effect) and it
// swallows and reports its own errors rather than throwing.
async function refetchAndBroadcast(variantIds) {
  if (!variantIds || variantIds.length === 0) return;
  try {
    const variants = await Variant.find({ _id: { $in: variantIds } }, 'stock style').lean();
    const changes = variants.map((v) => ({ variantId: v._id, styleId: v.style, stock: v.stock }));
    broadcastStockChanges(changes);
    // Reuses this exact chokepoint (already called by all six stock-changing
    // operations) rather than re-wiring a webhook trigger into each of them
    // a second time. Fire-and-forget, same reasoning as the SSE broadcast.
    triggerWebhookEvent('stock.changed', { changes }).catch((err) => reportError(null, err, 'stock.changed webhook trigger failed'));
  } catch (err) {
    reportError(null, err, 'Stock broadcast failed');
  }
}

module.exports = { addClient, removeClient, broadcastStockChanges, refetchAndBroadcast };
