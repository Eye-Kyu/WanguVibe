const crypto = require('crypto');
const { triggerWebhookEvent } = require('../services/webhooks');
const { createWebhook, getAllWebhooks, updateWebhook, deleteWebhook } = require('../controllers/webhookController');
const WebhookSubscription = require('../models/WebhookSubscription');
const { makeUser } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('triggerWebhookEvent', () => {
  let admin;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
  });

  test('sends only to active subscriptions matching the event, with a correct HMAC signature', async () => {
    const sub = await WebhookSubscription.create({ url: 'https://example.com/hook', events: ['sale.completed'], secret: 'test-secret', createdBy: admin._id });
    await WebhookSubscription.create({ url: 'https://example.com/other-event', events: ['stock.changed'], secret: 'test-secret', createdBy: admin._id });
    await WebhookSubscription.create({ url: 'https://example.com/inactive', events: ['sale.completed'], secret: 'test-secret', active: false, createdBy: admin._id });

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 });
    try {
      await triggerWebhookEvent('sale.completed', { saleId: 'abc123' });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe(sub.url);
      const body = options.body;
      const parsed = JSON.parse(body);
      expect(parsed.event).toBe('sale.completed');
      expect(parsed.data).toEqual({ saleId: 'abc123' });

      const expectedSig = crypto.createHmac('sha256', sub.secret).update(body).digest('hex');
      expect(options.headers['X-Webhook-Signature']).toBe(`sha256=${expectedSig}`);
    } finally {
      fetchMock.mockRestore();
    }
  });

  test("a delivery failure to one subscriber does not block another subscriber's delivery", async () => {
    await WebhookSubscription.create({ url: 'https://example.com/fails', events: ['stock.changed'], secret: 's1', createdBy: admin._id });
    await WebhookSubscription.create({ url: 'https://example.com/succeeds', events: ['stock.changed'], secret: 's2', createdBy: admin._id });

    const fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      if (url === 'https://example.com/fails') throw new Error('network down');
      return { ok: true, status: 200 };
    });
    try {
      await expect(triggerWebhookEvent('stock.changed', { changes: [] })).resolves.toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fetchMock.mockRestore();
    }
  });

  test('no-ops (never calls fetch) when there are zero matching subscriptions', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200 });
    try {
      await triggerWebhookEvent('sale.completed', {});
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});

describe('Webhook subscription CRUD', () => {
  let admin;
  beforeEach(async () => {
    admin = await makeUser({ role: 'admin' });
  });

  test('createWebhook generates a secret, returns it once, and never re-returns it from getAllWebhooks', async () => {
    const req = { body: { url: 'https://example.com/hook', events: ['sale.completed'] }, user: { id: admin._id.toString() } };
    const res = mockRes();
    await createWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    const created = res.json.mock.calls[0][0];
    expect(created.secret).toBeTruthy();
    expect(created.url).toBe('https://example.com/hook');

    const listRes = mockRes();
    await getAllWebhooks({}, listRes);
    const listed = listRes.json.mock.calls[0][0];
    expect(listed).toHaveLength(1);
    expect(listed[0].secret).toBeUndefined();
  });

  test('rejects an invalid event name', async () => {
    const req = { body: { url: 'https://example.com/hook', events: ['not.a.real.event'] }, user: { id: admin._id.toString() } };
    const res = mockRes();
    await createWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('updateWebhook can toggle active without touching the secret', async () => {
    const sub = await WebhookSubscription.create({ url: 'https://example.com/hook', events: ['sale.completed'], secret: 'abc', createdBy: admin._id });
    const req = { params: { id: sub._id.toString() }, body: { active: false } };
    const res = mockRes();
    await updateWebhook(req, res);

    expect(res.status).not.toHaveBeenCalled();
    const updated = await WebhookSubscription.findById(sub._id);
    expect(updated.active).toBe(false);
    expect(updated.secret).toBe('abc');
  });

  test('deleteWebhook removes the subscription', async () => {
    const sub = await WebhookSubscription.create({ url: 'https://example.com/hook', events: ['sale.completed'], secret: 'abc', createdBy: admin._id });
    const req = { params: { id: sub._id.toString() } };
    const res = mockRes();
    await deleteWebhook(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(await WebhookSubscription.findById(sub._id)).toBeNull();
  });
});
