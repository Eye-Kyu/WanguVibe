const Audit = require('../models/Audit');

exports.logAction = async (req, res) => {
  try {
    const { action, details, userId, timestamp } = req.body;
    const audit = new Audit({ action, details, userId, timestamp });
    await audit.save();
    res.status(201).json({ message: 'Action logged' });
  } catch (err) {
    console.error('Audit log error:', err);
    res.status(500).json({ error: 'Server error logging action' });
  }
};

module.exports = exports;