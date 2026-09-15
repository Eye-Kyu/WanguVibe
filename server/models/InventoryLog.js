const mongoose = require('mongoose');

const inventoryLogSchema = new mongoose.Schema({
    variant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Variant',
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    action: {
        type: String,
        enum: ['restock', 'adjustment', 'purchase_order'],
        required: true
    },
    relatedPurchaseOrder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PurchaseOrder',
        default: null
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    date: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('InventoryLog', inventoryLogSchema);
