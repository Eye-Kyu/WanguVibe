// Per-test-file (worker) connection lifecycle against the shared replica set
// started in mongo-globalSetup.js. Each worker gets its own database name
// so parallel test files never collide on unique indexes (sku, barcode,
// gift-card code, etc.), and every collection is wiped between individual
// tests so ordering never matters.
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '.mongo-config.json');

beforeAll(async () => {
  const { uri } = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const dbName = `test_worker_${process.env.JEST_WORKER_ID || 1}`;
  await mongoose.connect(uri, { dbName });
});

afterEach(async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});
