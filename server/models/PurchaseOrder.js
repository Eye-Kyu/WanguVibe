const mongoose = require('mongoose');

// Tracks what was ordered from a supplier, at what cost, and how much has
// actually arrived — receivePurchaseOrder (in purchaseOrderController.js) is
// the only thing that ever increments quantityReceived/Variant.stock for a
// PO; this model itself just holds the record.
const purchaseOrderSchema = new mongoose.Schema({
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  items: [
    {
      variant: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant', required: true },
      // Denormalized at order time so the PO still reads correctly even if
      // the style/variant is later edited — same convention as Sale.items.
      styleName: { type: String, required: true },
      size: { type: String, required: true },
      color: { type: String, required: true },
      quantityOrdered: { type: Number, required: true, min: 1 },
      quantityReceived: { type: Number, default: 0, min: 0 },
      unitCost: { type: Number, required: true, min: 0 },
    },
  ],
  status: { type: String, enum: ['ordered', 'partially_received', 'received', 'cancelled'], default: 'ordered' },
  expectedDate: { type: Date, default: null },
  notes: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ supplier: 1 });

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
