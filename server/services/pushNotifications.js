// Sends browser push notifications to admin staff — shift discrepancies,
// eTIMS retry backlog, low stock. VAPID keys are a self-generated keypair
// (like a TLS cert), not a third-party credential; no-ops cleanly if unset,
// same optional-integration pattern as Sentry.
const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const { reportError } = require('../utils/reportError');

const configured = Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (configured) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Sends to every admin's subscribed devices. A dead subscription (410/404 —
// the browser unsubscribed, or the endpoint expired) is removed rather than
// retried forever; any other failure is reported but doesn't block sending
// to the remaining subscribers.
async function notifyAdmins({ title, body, tag, data }) {
  if (!configured) return;

  const subs = await PushSubscription.find().populate('user', 'role');
  const adminSubs = subs.filter((s) => s.user?.role === 'admin');
  if (adminSubs.length === 0) return;

  const payload = JSON.stringify({ title, body, tag, data });

  await Promise.all(adminSubs.map(async (sub) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await PushSubscription.deleteOne({ _id: sub._id });
      } else {
        reportError(null, err, 'Push notification send failed');
      }
    }
  }));
}

module.exports = { notifyAdmins, isConfigured: () => configured };
