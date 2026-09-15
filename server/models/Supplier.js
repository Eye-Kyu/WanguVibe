const mongoose = require('mongoose');

const supplierSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  contactName: { type: String, default: '', trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  address: { type: String, default: '' },
  notes: { type: String, default: '' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

supplierSchema.index({ name: 'text', contactName: 'text', phone: 'text', email: 'text' });

module.exports = mongoose.model('Supplier', supplierSchema);
