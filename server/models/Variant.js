const mongoose = require('mongoose');

// A Variant is one sellable size/color combination of a Style. This is the
// unit that carries stock, gets its own printed barcode (Eye-Kyu tags
// garments individually), and is what a Sale line item actually references.
const variantSchema = new mongoose.Schema({
  style: { type: mongoose.Schema.Types.ObjectId, ref: 'Style', required: true },
  size: { type: String, required: true, trim: true }, // e.g. "S", "M", "L", "42", "One Size"
  color: { type: String, required: true, trim: true },
  sku: { type: String, required: true, unique: true, trim: true }, // e.g. DRS-0042-M-RED — printed on the garment tag
  barcode: { type: String, unique: true, sparse: true, trim: true }, // scannable code; often equals sku but kept separate in case a printed code differs
  stock: { type: Number, default: 0, min: 0 },
  priceOverride: { type: Number, default: null }, // null = use style.basePrice; set for variants priced differently (e.g. plus sizes)
  reorderThreshold: { type: Number, default: 2 }, // "low stock" trigger for THIS variant — a boutique's low-stock number is much smaller than a mini-mart's
  active: { type: Boolean, default: true },
}, { timestamps: true });

// One variant per style/size/color combination
variantSchema.index({ style: 1, size: 1, color: 1 }, { unique: true });
variantSchema.index({ sku: 'text', barcode: 'text' });

module.exports = mongoose.model('Variant', variantSchema);
