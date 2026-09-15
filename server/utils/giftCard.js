const crypto = require('crypto');

// e.g. GC-3F9A2B1C0D — short enough to write on a physical card, random
// enough that collisions are rare (handled by retry-on-conflict at the
// call site, since uniqueness is ultimately enforced by the DB index).
function generateGiftCardCode() {
  return `GC-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

module.exports = { generateGiftCardCode };
