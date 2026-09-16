const webpush = require('web-push');
const { notifyAdmins, isConfigured } = require('../services/pushNotifications');
const PushSubscription = require('../models/PushSubscription');
const { makeUser } = require('./fixtures');

describe('notifyAdmins', () => {
  test('is configured when VAPID keys are present (test env sets throwaway ones)', () => {
    expect(isConfigured()).toBe(true);
  });

  test('sends only to admin-role subscribers, not cashiers', async () => {
    const admin = await makeUser({ role: 'admin' });
    const cashier = await makeUser({ role: 'cashier' });
    await PushSubscription.create({ user: admin._id, endpoint: 'https://push.example/admin', keys: { p256dh: 'a', auth: 'b' } });
    await PushSubscription.create({ user: cashier._id, endpoint: 'https://push.example/cashier', keys: { p256dh: 'a', auth: 'b' } });

    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({});
    try {
      await notifyAdmins({ title: 'Test', body: 'Body', tag: 'test' });
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy.mock.calls[0][0].endpoint).toBe('https://push.example/admin');
    } finally {
      sendSpy.mockRestore();
    }
  });

  test('removes a dead subscription on a 410 response, without throwing', async () => {
    const admin = await makeUser({ role: 'admin' });
    const sub = await PushSubscription.create({ user: admin._id, endpoint: 'https://push.example/dead', keys: { p256dh: 'a', auth: 'b' } });

    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockRejectedValue({ statusCode: 410 });
    try {
      await expect(notifyAdmins({ title: 'Test', body: 'Body' })).resolves.toBeUndefined();
      const stillThere = await PushSubscription.findById(sub._id);
      expect(stillThere).toBeNull();
    } finally {
      sendSpy.mockRestore();
    }
  });

  test('a non-410 send failure is reported but does not throw or block other subscribers', async () => {
    const admin1 = await makeUser({ role: 'admin' });
    const admin2 = await makeUser({ role: 'admin' });
    await PushSubscription.create({ user: admin1._id, endpoint: 'https://push.example/fails', keys: { p256dh: 'a', auth: 'b' } });
    await PushSubscription.create({ user: admin2._id, endpoint: 'https://push.example/succeeds', keys: { p256dh: 'a', auth: 'b' } });

    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockImplementation(async (sub) => {
      if (sub.endpoint.endsWith('/fails')) throw { statusCode: 500, message: 'push service down' };
      return {};
    });
    try {
      await expect(notifyAdmins({ title: 'Test', body: 'Body' })).resolves.toBeUndefined();
      expect(sendSpy).toHaveBeenCalledTimes(2);
      // The failing one wasn't a 410, so it must NOT have been deleted.
      const stillThere = await PushSubscription.findOne({ endpoint: 'https://push.example/fails' });
      expect(stillThere).toBeTruthy();
    } finally {
      sendSpy.mockRestore();
    }
  });

  test('no-ops with no admin subscriptions at all', async () => {
    const sendSpy = jest.spyOn(webpush, 'sendNotification').mockResolvedValue({});
    try {
      await notifyAdmins({ title: 'Test', body: 'Body' });
      expect(sendSpy).not.toHaveBeenCalled();
    } finally {
      sendSpy.mockRestore();
    }
  });
});
