const InventoryLog = require('../models/InventoryLog');
const Variant = require('../models/Variant');
const { logAudit } = require('../utils/auditLogger');

exports.restockVariant = async (req, res) => {
    try {
        const { variantId, quantity } = req.body;
        const userId = req.user.id;

        const variant = await Variant.findById(variantId);
        if (!variant) return res.status(404).json({ error: 'Variant not found' });

        variant.stock += quantity;
        await variant.save();

        const log = new InventoryLog({
            variant: variantId,
            quantity,
            action: 'restock',
            user: userId
        });

        await log.save();
        logAudit({ action: 'stock_restocked', details: { variantId, quantity, newStock: variant.stock }, userId });

        res.status(200).json({ message: 'Variant restocked', variant, log });
    } catch (err) {
        console.error('Error restocking variant:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

exports.getInventoryLogs = async (req, res) => {
    try {
        const logs = await InventoryLog.find()
            .sort({ date: -1 })
            .populate({ path: 'variant', select: 'size color sku', populate: { path: 'style', select: 'name' } })
            .populate('user', 'name email');
        res.status(200).json(logs);
    } catch (err) {
        console.error('Error fetching inventory logs:', err);
        res.status(500).json({ error: 'Server error' });
    }
};
