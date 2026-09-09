const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  barcode: { type: String, unique: true, sparse: true },
  price: { type: Number, required: true },
  stock: { type: Number, default: 0 },
  image: { type: String, default: '' },
  category: { type: String, default: '' }
}, { timestamps: true });

productSchema.index({ name: 'text', barcode: 'text' });

module.exports = mongoose.model('Product', productSchema);