const Audit = require('../models/Audit');

// Fire-and-forget audit write, called from inside controllers after the
// action it describes has already succeeded. Never let a logging failure
// take down the request that triggered it.
async function logAudit({ action, details, userId }) {
  try {
    await Audit.create({ action, details, userId });
  } catch (err) {
    console.error('Audit log write failed:', err.message);
  }
}

module.exports = { logAudit };
