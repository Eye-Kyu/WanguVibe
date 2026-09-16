const crypto = require('crypto');
const WebhookSubscription = require('../models/WebhookSubscription');
const { reportError } = require('../utils/reportError');

const VALID_EVENTS = ['sale.completed', 'stock.changed'];

// POST /api/webhooks — the secret is generated server-side (never accepted
// from the client) and returned exactly once, in this response — it's
// stored in the DB afterward, but never re-returned by GET /.
exports.createWebhook = async (req, res) => {
  try {
    const { url, events } = req.body;
    if (!url || !url.trim()) return res.status(400).json({ error: 'url is required' });
    if (!Array.isArray(events) || events.length === 0 || !events.every((e) => VALID_EVENTS.includes(e))) {
      return res.status(400).json({ error: `events must be a non-empty array of: ${VALID_EVENTS.join(', ')}` });
    }
    const secret = crypto.randomBytes(32).toString('hex');
    const webhook = await WebhookSubscription.create({ url: url.trim(), events, secret, createdBy: req.user.id });
    res.status(201).json({ ...webhook.toObject(), secret });
  } catch (err) {
    reportError(req, err, 'Error creating webhook subscription');
    res.status(400).json({ error: 'Invalid webhook data' });
  }
};

// GET /api/webhooks — secret is never included in the list view.
exports.getAllWebhooks = async (req, res) => {
  try {
    const webhooks = await WebhookSubscription.find().select('-secret').sort({ createdAt: -1 });
    res.json(webhooks);
  } catch (err) {
    reportError(req, err, 'Error fetching webhook subscriptions');
    res.status(500).json({ error: 'Server error fetching webhook subscriptions' });
  }
};

exports.updateWebhook = async (req, res) => {
  try {
    const { url, events, active } = req.body;
    if (events !== undefined && (!Array.isArray(events) || events.length === 0 || !events.every((e) => VALID_EVENTS.includes(e)))) {
      return res.status(400).json({ error: `events must be a non-empty array of: ${VALID_EVENTS.join(', ')}` });
    }
    const setFields = { url, events, active };
    Object.keys(setFields).forEach((k) => setFields[k] === undefined && delete setFields[k]);

    const updated = await WebhookSubscription.findByIdAndUpdate(req.params.id, setFields, { new: true }).select('-secret');
    if (!updated) return res.status(404).json({ error: 'Webhook subscription not found' });
    res.json(updated);
  } catch (err) {
    reportError(req, err, 'Error updating webhook subscription');
    res.status(400).json({ error: 'Invalid update data' });
  }
};

exports.deleteWebhook = async (req, res) => {
  try {
    const deleted = await WebhookSubscription.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Webhook subscription not found' });
    res.json({ message: 'Webhook subscription deleted' });
  } catch (err) {
    reportError(req, err, 'Error deleting webhook subscription');
    res.status(400).json({ error: 'Error deleting webhook subscription' });
  }
};
