const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '.mongo-config.json');

module.exports = async function globalTeardown() {
  if (global.__MONGO_REPLSET__) {
    await global.__MONGO_REPLSET__.stop();
  }
  if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
};
