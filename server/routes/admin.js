const express = require('express');
const { reportError } = require('../utils/reportError');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { MIN_PASSWORD_LENGTH, isAcceptablePassword } = require('../utils/password');
const { protect, adminOnly } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// Admin route to create a user
router.post('/create-user', protect, adminOnly, async (req, res) => {
  const { name, username, password, role } = req.body;

  if (!name || !username || !password || !role) {
    return res.status(400).json({ message: 'All fields are required' });
  }
  if (typeof username !== 'string' || !isAcceptablePassword(password)) {
    return res.status(400).json({ message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ message: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      username,
      password: hashedPassword,
      role
    });

    await newUser.save();
    logAudit({ action: 'user_created', details: { userId: newUser._id, username, role }, userId: req.user.id });

    res.status(201).json({ message: 'User created successfully', user: { name, username, role } });
  } catch (err) {
    reportError(req, err, 'Error creating user');
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
