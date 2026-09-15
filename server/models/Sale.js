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
      },
      // How many of this line's quantity have been returned so far — caps
      // further returns and lets a line be partially returned over time.
      returnedQuantity: {
        type: Number,
        default: 0,
        min: 0
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
    enum: ['cash', 'mpesa', 'card', 'store_credit', 'gift_card'],
    default: 'cash'
  },
  // Gift cards SOLD as a line item in this sale — separate from items[]
  // since a gift card isn't a Style/Variant and never touches stock.
  giftCardsSold: [
    {
      code: { type: String, required: true },
      amount: { type: Number, required: true }
    }
  ],
  // Set when paymentMethod === 'gift_card' — which card paid for this sale.
  giftCardRedeemed: {
    code: { type: String, default: null },
    amount: { type: Number, default: null }
  },
  status: {
    type: String,
    enum: ['completed', 'partially_returned', 'returned'],
    default: 'completed'
  },
  refundedAmount: {
    type: Number,
    default: 0
  },
  // One entry per return transaction (a sale can be returned more than once,
  // potentially to different destinations) — refundedAmount is just
  // sum(returns[].amount), kept as a running total for cheap reads/aggregation.
  returns: [
    {
      destination: {
        type: String,
        enum: ['cash', 'original_payment', 'store_credit'],
        required: true
      },
      amount: { type: Number, required: true },
      items: [
        {
          variant: { type: mongoose.Schema.Types.ObjectId, ref: 'Variant' },
          quantity: Number
        }
      ],
      processedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      processedAt: { type: Date, default: Date.now }
    }
  ],
  cashier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Optional so the API isn't a breaking change for callers that don't send
  // one — the POS UI's shift-open gate is what actually enforces the
  // discipline in practice.
  shift: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shift',
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // KRA eTIMS submission state — set after finalizeSale commits, never
  // blocking the sale itself (see server/services/etims.js). etimsQrPayload
  // is deliberately separate from the existing receipt-lookup QR the client
  // generates from {id, total, date}; the two are never conflated.
  etimsStatus: {
    type: String,
    enum: ['not_submitted', 'pending', 'accepted', 'rejected', 'unreachable'],
    default: 'not_submitted'
  },
  etimsInvoiceNumber: { type: String, default: null },
  etimsQrPayload: { type: String, default: null },
  etimsSubmittedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Sale', saleSchema);
