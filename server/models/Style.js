const mongoose = require('mongoose');

// A Style is the boutique-level "product" — the thing customers browse by name
// (e.g. "Floral Wrap Dress"). It carries everything that does NOT vary by
// size/color. The sellable, stock-carrying unit is the Variant (see Variant.js).
const styleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  styleCode: { type: String, unique: true, sparse: true, trim: true }, // internal style number, e.g. "DRS-0042"
  brand: { type: String, default: '', trim: true },
  description: { type: String, default: '' },
  category: { type: String, default: '', trim: true }, // e.g. Tops, Bottoms, Dresses, Outerwear, Accessories
  season: { type: String, default: '', trim: true }, // e.g. "SS26", "Permanent Collection"
  material: { type: String, default: '', trim: true }, // fabric/material composition
  basePrice: { type: Number, required: true },
  costPrice: { type: Number, default: 0 },
  images: [{ type: String }], // style-level photos; a variant can reuse these or none if color-specific shots aren't available
  active: { type: Boolean, default: true }, // soft "discontinued" flag — keeps history on old sales without showing on the POS grid
}, { timestamps: true });

styleSchema.index({ name: 'text', styleCode: 'text', brand: 'text' });

module.exports = mongoose.model('Style', styleSchema);
