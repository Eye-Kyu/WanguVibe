const crypto = require('crypto');
const WebhookSubscription = require('../models/WebhookSubscription');
const { reportError } = require('../utils/reportError');
const logger = require('../utils/logger');

// Fires an event to every active subscription that's registered for it.
// Deliberately single-attempt for v1 (no retry queue) — a per-subscriber
// delivery failure is caught and logged here (never thrown, never affects
// another subscriber's delivery), but a failure loading the subscription
// list itself is allowed to propagate — same shape as notifyAdmins() in
// pushNotifications.js, so every call site uses the identical
// `triggerWebhookEvent(...).catch((err) => reportError(...))` pattern.
async function triggerWebhookEvent(eventName, data) {
  const subscriptions = await WebhookSubscription.find({ active: true, events: eventName });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify({ event: eventName, data, timestamp: new Date().toISOString() });

  await Promise.all(subscriptions.map(async (sub) => {
    try {
      const signature = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': `sha256=${signature}` },
        body,
      });
      // fetch only rejects on a network-level failure — a subscriber
      // returning a non-2xx status is a delivery failure too, just one that
      // needs its own check rather than a caught exception.
      if (!res.ok) {
        logger.warn({ subscriptionId: sub._id, url: sub.url, status: res.status }, 'Webhook delivery received a non-2xx response');
      }
    } catch (err) {
      reportError(null, err, `Webhook delivery failed for subscription ${sub._id}`);
    }
  }));
}

module.exports = { triggerWebhookEvent };
