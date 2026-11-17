const express = require('express');
const { reportError } = require('../utils/reportError');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { MIN_PASSWORD_LENGTH, isAcceptablePassword } = require('../utils/password');
const User = require('../models/User');

const { protect, adminOnly } = require('../middleware/authMiddleware');
const { logAudit } = require('../utils/auditLogger');

// GET all users (admin only)
router.get('/', protect, adminOnly, async (req, res) => {
    try {
        const users = await User.find().select('-password');
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// PUT update user (admin only)
router.put('/:id', protect, adminOnly, async (req, res) => {
    try {
        const { name, role, password } = req.body;
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (name && name.trim()) user.name = name.trim();
        if (role && ['admin', 'cashier'].includes(role)) user.role = role;
        if (password !== undefined && password !== '') {
            if (!isAcceptablePassword(password)) {
                return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
            }
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();
        logAudit({ action: 'user_updated', details: { userId: user._id, changes: { name, role, passwordChanged: !!password } }, userId: req.user.id });
        const result = user.toObject();
        delete result.password;
        res.json(result);
    } catch (err) {
        reportError(req, err, 'Error updating user');
        res.status(500).json({ error: 'Failed to update user' });
    }
});

// DELETE a user by ID (admin only)
router.delete('/:id', protect, adminOnly, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.role === 'admin' && user._id.toString() === req.user.id) {
            return res.status(403).json({ error: 'Admins cannot delete their own account' });
        }

        await user.deleteOne();
        logAudit({ action: 'user_deleted', details: { userId: user._id, username: user.username }, userId: req.user.id });
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
