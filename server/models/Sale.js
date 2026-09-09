const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      quantity: {
        type: Number,
        required: true
      },
      discount: {
        type: Number,
        default: 0, // Percentage discount (0-100)
        min: 0,
        max: 100
      }
    }
  ],
  totalAmount: {
    type: Number,
    required: true
  },
  cartDiscount: {
    type: Number,
    default: 0, // Percentage discount for entire cart (0-100)
    min: 0,
    max: 100
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'mpesa'],
    default: 'cash'
  },
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Sale', saleSchema);