const PushSubscription = require('../models/PushSubscription');
const { reportError } = require('../utils/reportError');
const { isConfigured } = require('../services/pushNotifications');

exports.getVapidPublicKey = (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null, configured: isConfigured() });
};

// POST /api/push-subscriptions — adminOnly (these alerts are all admin/
// back-office concerns). Upserts by endpoint so re-subscribing the same
// browser (e.g. after clearing permission) doesn't create a duplicate row.
exports.subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: 'A valid push subscription (endpoint + keys) is required' });
    }
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { endpoint, keys, user: req.user.id },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json({ message: 'Subscribed' });
  } catch (err) {
    reportError(req, err, 'Error saving push subscription');
    res.status(400).json({ error: 'Failed to save push subscription' });
  }
};

exports.unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ error: 'endpoint is required' });
    await PushSubscription.deleteOne({ endpoint, user: req.user.id });
    res.json({ message: 'Unsubscribed' });
  } catch (err) {
    reportError(req, err, 'Error removing push subscription');
    res.status(400).json({ error: 'Failed to remove push subscription' });
  }
};
