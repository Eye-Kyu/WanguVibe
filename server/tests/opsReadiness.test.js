const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const { backup, restore } = require('../scripts/backupLib');
const { checkEnv } = require('../config/validateEnv');
const Sale = require('../models/Sale');
const { makeStyleWithVariant, makeUser } = require('./fixtures');

const CONFIG_PATH = path.join(__dirname, '.mongo-config.json');
const { uri } = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

describe('backup and restore', () => {
  let outDir;
  beforeEach(() => { outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wv-backup-')); });
  afterEach(() => fs.rmSync(outDir, { recursive: true, force: true }));

  test('round-trips documents exactly, including ObjectIds, dates and indexes', async () => {
    const cashier = await makeUser();
    const { variant } = await makeStyleWithVariant({ name: 'Backup Shirt' });
    await Sale.create({
      items: [{ variant: variant._id, styleName: 'Backup Shirt', size: 'M', color: 'Black', unitPrice: 1234.5, quantity: 2 }],
      totalAmount: 2469,
      paymentMethod: 'cash',
      payments: [{ method: 'cash', amount: 2469 }],
      cashier: cashier._id,
      clientSaleId: 'backup-test-0001',
    });
    await Sale.init();

    const sourceDb = mongoose.connection.db.databaseName;
    const { dir, manifest } = await backup({ uri, dbName: sourceDb, outDir });
    expect(manifest.collections.sales.count).toBe(1);

    const target = `${sourceDb}_restore_${Date.now()}`;
    const result = await restore({ uri, dbName: target, fromDir: dir });
    expect(result.restored.sales).toBe(1);

    const restoredDb = mongoose.connection.client.db(target);
    try {
      const original = await Sale.findOne().lean();
      const copy = await restoredDb.collection('sales').findOne({ _id: original._id });
      expect(copy.cashier).toBeInstanceOf(mongoose.mongo.ObjectId);
      expect(copy.cashier.equals(original.cashier)).toBe(true);
      expect(copy.createdAt).toBeInstanceOf(Date);
      expect(copy.createdAt.getTime()).toBe(original.createdAt.getTime());
      expect(copy.items[0].unitPrice).toBe(1234.5);
      const indexNames = (await restoredDb.collection('sales').indexes()).map((i) => i.name);
      expect(indexNames).toContain('clientSaleId_1');
    } finally {
      await restoredDb.dropDatabase();
    }
  });

  test('refuses to restore over a non-empty database without --drop', async () => {
    await makeUser();
    const sourceDb = mongoose.connection.db.databaseName;
    const { dir } = await backup({ uri, dbName: sourceDb, outDir });
    await expect(restore({ uri, dbName: sourceDb, fromDir: dir })).rejects.toThrow(/not empty/);
  });

  test('keeps only the newest N backups', async () => {
    await makeUser();
    const db = mongoose.connection.db.databaseName;
    for (let i = 0; i < 4; i++) {
      await backup({ uri, dbName: db, outDir, keep: 2, now: new Date(Date.UTC(2026, 0, 1 + i)) });
    }
    const left = fs.readdirSync(outDir).sort();
    expect(left).toHaveLength(2);
    expect(left[0]).toMatch(/2026-01-03/);
  });
});

describe('startup configuration checks', () => {
  const base = { MONGO_URI: 'mongodb://x', JWT_SECRET: 'a'.repeat(48), CLIENT_URL: 'https://pos.example.com' };

  test('a sane production config passes', () => {
    const { errors } = checkEnv({ ...base, NODE_ENV: 'production', TRUST_PROXY: '1' });
    expect(errors).toEqual([]);
  });

  test('production refuses a weak or example JWT secret', () => {
    expect(checkEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'replace-with-a-long-random-string' }).errors.join()).toMatch(/JWT_SECRET/);
    expect(checkEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'short' }).errors.join()).toMatch(/JWT_SECRET/);
  });

  test('real M-Pesa needs its credentials, an https callback and a long token', () => {
    const { errors } = checkEnv({ ...base, MPESA_MODE: 'production', MPESA_CALLBACK_URL: 'http://x', MPESA_CALLBACK_TOKEN: 'short' });
    const all = errors.join('\n');
    expect(all).toMatch(/MPESA_CONSUMER_KEY/);
    expect(all).toMatch(/must be https/);
    expect(all).toMatch(/at least 32 characters/);
  });

  test('live eTIMS and SMS need their settings; typos in modes are caught', () => {
    expect(checkEnv({ ...base, ETIMS_MODE: 'live' }).errors.join()).toMatch(/ETIMS_TIN/);
    expect(checkEnv({ ...base, SMS_MODE: 'live' }).errors.join()).toMatch(/AT_API_KEY/);
    expect(checkEnv({ ...base, ETIMS_MODE: 'Live' }).errors.join()).toMatch(/must be mock or live/);
  });

  test('production warns loudly about simulated integrations', () => {
    const { warnings } = checkEnv({ ...base, NODE_ENV: 'production' });
    expect(warnings.join('\n')).toMatch(/MPESA_MODE=mock in production/);
    expect(warnings.join('\n')).toMatch(/NOT being sent to KRA/);
  });
});
