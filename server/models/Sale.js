const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema({
  items: [
    {
      variant: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Variant',
        required: true
      },
      // Denormalized at sale time so a receipt/report still reads correctly
      // even if the style/variant is later edited or deactivated.
      styleName: { type: String, required: true },
      size: { type: String, required: true },
      color: { type: String, required: true },
      unitPrice: { type: Number, required: true }, // price actually charged (basePrice or priceOverride) at sale time
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
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    default: null
  },
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
    enum: ['cash', 'mpesa', 'card'],
    default: 'cash'
  },
  status: {
    type: String,
    enum: ['completed', 'partially_returned', 'returned'],
    default: 'completed'
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
