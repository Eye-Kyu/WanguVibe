const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const { protect, adminOnly } = require('../middleware/authMiddleware');

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
        if (password && password.length >= 6) {
            user.password = await bcrypt.hash(password, 10);
        }

        await user.save();
        const result = user.toObject();
        delete result.password;
        res.json(result);
    } catch (err) {
        console.error('Error updating user:', err);
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
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

module.exports = router;
