// Starts one real MongoDB replica set (single-node) shared by the whole test
// run — Mongoose transactions (used throughout salesController) only work
// against a replica set, not a standalone mongod, so a plain in-memory
// standalone server isn't enough here. The instance is stashed on `global`
// (read back by mongo-globalTeardown.js, which Jest runs in the same
// process) and its URI is written to disk since globalSetup and the actual
// test-worker processes do NOT share `global` or env vars.
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '.mongo-config.json');

module.exports = async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  global.__MONGO_REPLSET__ = replSet;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ uri: replSet.getUri() }));
};

module.exports.CONFIG_PATH = CONFIG_PATH;
