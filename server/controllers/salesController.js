const mongoose = require('mongoose');
const Variant = require('../models/Variant');
const Style = require('../models/Style');
const Sale = require('../models/Sale');
const Shift = require('../models/Shift');
const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const StoreCreditLedger = require('../models/StoreCreditLedger');
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const { logAudit } = require('../utils/auditLogger');
const HttpError = require('../utils/httpError');
const { generateGiftCardCode } = require('../utils/giftCard');
const { submitInvoice } = require('../services/etims');
const { reportError } = require('../utils/reportError');

const PAYMENT_METHODS = ['cash', 'mpesa', 'card', 'store_credit', 'gift_card'];

const populateSale = (query) => query
  .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
  .populate('cashier', 'name')
  .populate('customer', 'name phone');

// Validates and commits a sale — stock decrement, the Sale record itself,
// and (for store-credit/gift-card payments or gift-card sales) a customer's
// balance and gift card balances, all in one transaction. This is the one
// place "a sale is finalized" happens, shared by the synchronous HTTP path
// (createSale, below) and the async M-Pesa callback path (paymentsController)
// — neither redefines what finalizing a sale means on its own. Throws
// HttpError on any validation/business-rule failure; returns the saved
// (unpopulated) Sale doc on success.
async function finalizeSale({ items, totalAmount, cartDiscount, paymentMethod, customer, shift, giftCardsSold, giftCardCode, cashier, simulateEtimsFailure }) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new HttpError(400, 'Invalid or empty items');
  }
  if (!totalAmount || totalAmount <= 0) {
    throw new HttpError(400, 'Invalid total amount');
  }
  // Normalize payment method: accept 'Cash', 'M-Pesa', 'Card', 'Store Credit',
  // 'Gift Card', 'cash', 'mpesa', 'card', 'store_credit', etc. — spaces become
  // underscores (so 'Store Credit' -> 'store_credit') before stripping
  // anything else that isn't a-z/underscore.
  const methodNorm = (paymentMethod || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');
  if (!PAYMENT_METHODS.includes(methodNorm)) {
    throw new HttpError(400, `Invalid payment method: "${paymentMethod}"`);
  }
  if ((cartDiscount ?? 0) < 0 || (cartDiscount ?? 0) > 100) {
    throw new HttpError(400, 'Cart discount must be between 0 and 100%');
  }
  if (!cashier) {
    throw new HttpError(401, 'User authentication required');
  }
  if (methodNorm === 'store_credit' && !customer) {
    throw new HttpError(400, 'A customer must be selected to pay with store credit');
  }
  if (methodNorm === 'gift_card' && !giftCardCode) {
    throw new HttpError(400, 'A gift card code is required');
  }
  const cardsToSell = Array.isArray(giftCardsSold) ? giftCardsSold : [];
  for (const gc of cardsToSell) {
    if (!gc.amount || gc.amount <= 0) {
      throw new HttpError(400, 'Gift card amount must be greater than 0');
    }
  }

  const session = await mongoose.startSession();
  try {
    let sale;
    const auditExtras = [];

    await session.withTransaction(async () => {
      // Optional: kept optional so the API isn't a breaking change, but if a
      // shift is supplied it must actually belong to this cashier and be open —
      // the client-side gate is what enforces the discipline in practice.
      if (shift) {
        const shiftDoc = await Shift.findById(shift).session(session);
        if (!shiftDoc || shiftDoc.openedBy.toString() !== cashier || shiftDoc.status !== 'open') {
          throw new HttpError(400, 'Invalid or closed shift');
        }
      }

      // Validate stock/discounts, build denormalized line items, decrement stock
      let calculatedTotal = 0;
      const builtItems = [];
      for (const item of items) {
        const variant = await Variant.findById(item.variant).populate('style', 'name basePrice').session(session);
        if (!variant) throw new HttpError(404, `Variant ${item.variant} not found`);
        if (!variant.style) throw new HttpError(404, `Style for variant ${item.variant} not found`);
        if (variant.stock < item.quantity) {
          throw new HttpError(400, `Insufficient stock for ${variant.style.name} (${variant.size}/${variant.color}). Only ${variant.stock} available.`);
        }
        if (item.discount < 0 || item.discount > 100) {
          throw new HttpError(400, `Discount for ${variant.style.name} must be between 0 and 100%`);
        }

        const unitPrice = variant.priceOverride ?? variant.style.basePrice;
        calculatedTotal += unitPrice * item.quantity * (1 - item.discount / 100);

        builtItems.push({
          variant: variant._id,
          styleName: variant.style.name,
          size: variant.size,
          color: variant.color,
          unitPrice,
          quantity: item.quantity,
          discount: item.discount || 0,
        });

        await Variant.findByIdAndUpdate(variant._id, { $inc: { stock: -item.quantity } }, { session });
      }

      calculatedTotal = calculatedTotal * (1 - (cartDiscount ?? 0) / 100);

      // Gift cards sold are added at face value, after the merchandise
      // discount — a gift card isn't merchandise and shouldn't be discounted.
      const giftCardsTotal = cardsToSell.reduce((s, gc) => s + gc.amount, 0);
      calculatedTotal += giftCardsTotal;

      if (Math.abs(calculatedTotal - totalAmount) > 0.5) {
        throw new HttpError(400, 'Total amount does not match calculated total');
      }

      sale = new Sale({
        items: builtItems,
        customer: customer || null,
        totalAmount,
        cartDiscount: cartDiscount ?? 0,
        paymentMethod: methodNorm,
        cashier,
        shift: shift || null,
      });

      // ── Payment: store credit — atomic guarded debit, aborts the whole
      // transaction (via null → throw) if the balance is insufficient ──
      if (methodNorm === 'store_credit') {
        const debited = await Customer.findOneAndUpdate(
          { _id: customer, storeCreditBalance: { $gte: totalAmount } },
          { $inc: { storeCreditBalance: -totalAmount } },
          { session }
        );
        if (!debited) throw new HttpError(400, 'Insufficient store credit balance');

        await StoreCreditLedger.create([{
          customer,
          amount: -totalAmount,
          reason: 'checkout_payment',
          relatedSale: sale._id,
          createdBy: cashier,
        }], { session });
        auditExtras.push({ action: 'store_credit_payment', details: { saleId: sale._id, customerId: customer, amount: totalAmount } });
      }

      // ── Payment: gift card redemption — no split-tender. Guarded, atomic,
      // conditionally flips status to 'redeemed' once the balance hits 0 ──
      if (methodNorm === 'gift_card') {
        const normalizedCode = giftCardCode.trim().toUpperCase();
        const redeemed = await GiftCard.findOneAndUpdate(
          { code: normalizedCode, status: 'active', currentBalance: { $gte: totalAmount } },
          [
            { $set: { currentBalance: { $subtract: ['$currentBalance', totalAmount] } } },
            { $set: { status: { $cond: [{ $lte: ['$currentBalance', 0] }, 'redeemed', '$status'] } } },
          ],
          { session, new: true }
        );
        if (!redeemed) throw new HttpError(400, 'Gift card not found, inactive, or insufficient balance');

        sale.giftCardRedeemed = { code: redeemed.code, amount: totalAmount };
        auditExtras.push({ action: 'gift_card_redeemed', details: { saleId: sale._id, code: redeemed.code, amount: totalAmount, remainingBalance: redeemed.currentBalance } });
      }

      // ── Gift cards sold as line items in this sale (independent of how
      // the sale itself was paid for) ──
      if (cardsToSell.length > 0) {
        const soldCards = [];
        for (const gc of cardsToSell) {
          let created = null;
          for (let attempt = 0; attempt < 5 && !created; attempt++) {
            try {
              const [doc] = await GiftCard.create([{
                code: generateGiftCardCode(),
                initialBalance: gc.amount,
                currentBalance: gc.amount,
                issuedBySale: sale._id,
              }], { session });
              created = doc;
            } catch (err) {
              if (err.code !== 11000) throw err; // only retry on a code collision
            }
          }
          if (!created) throw new HttpError(500, 'Failed to generate a unique gift card code');
          soldCards.push({ code: created.code, amount: gc.amount });
        }
        sale.giftCardsSold = soldCards;
        auditExtras.push({ action: 'gift_card_sold', details: { saleId: sale._id, cards: soldCards } });
      }

      await sale.save({ session });
    });

    for (const extra of auditExtras) {
      logAudit({ ...extra, userId: cashier });
    }

    // eTIMS submission happens after the sale has already committed, and
    // deliberately never undoes or blocks it — a boutique can't stop selling
    // because a government API is down. A failure queues the invoice for
    // manual admin retry instead of blocking or silently dropping it.
    try {
      const etimsResult = await submitInvoice(sale, { simulateFailure: simulateEtimsFailure });
      if (etimsResult.status === 'accepted') {
        sale.etimsStatus = 'accepted';
        sale.etimsInvoiceNumber = etimsResult.invoiceNumber;
        sale.etimsQrPayload = etimsResult.qrPayload;
        sale.etimsSubmittedAt = new Date();
        await sale.save();
      } else {
        sale.etimsStatus = 'unreachable';
        await sale.save();
        await EtimsRetryQueue.findOneAndUpdate(
          { sale: sale._id },
          { $set: { lastError: etimsResult.error, lastAttemptAt: new Date(), status: 'pending' }, $inc: { attempts: 1 } },
          { upsert: true }
        );
      }
    } catch (etimsErr) {
      reportError(null, etimsErr, 'eTIMS submission failed');
      sale.etimsStatus = 'unreachable';
      await sale.save().catch(() => {});
      await EtimsRetryQueue.findOneAndUpdate(
        { sale: sale._id },
        { $set: { lastError: etimsErr.message, lastAttemptAt: new Date(), status: 'pending' }, $inc: { attempts: 1 } },
        { upsert: true }
      ).catch(() => {});
    }

    return sale;
  } finally {
    session.endSession();
  }
}

// POST create new sale — the synchronous path (cash, card, store credit,
// gift card). M-Pesa goes through paymentsController.initiateMpesaPayment
// instead, since it can't complete until Safaricom's callback confirms it.
exports.createSale = async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'User authentication required' });
  }
  try {
    const sale = await finalizeSale({ ...req.body, cashier: req.user.id });
    const populatedSale = await populateSale(Sale.findById(sale._id));
    if (!populatedSale.cashier) {
      return res.status(400).json({ error: 'Cashier information not found' });
    }
    res.status(201).json(populatedSale);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    reportError(req, err, 'Error creating sale');
    res.status(400).json({ error: err.message });
  }
};

exports.finalizeSale = finalizeSale;
exports.populateSale = populateSale;

// GET all sales
exports.getAllSales = async (req, res) => {
  try {
    const { limit } = req.query;
    const query = limit ? Sale.find().sort({ createdAt: -1 }).limit(parseInt(limit)) : Sale.find().sort({ createdAt: -1 });
    const sales = await populateSale(query);
    res.json(sales);
  } catch (err) {
    reportError(req, err, 'Error fetching sales');
    res.status(500).json({ error: 'Server error fetching sales' });
  }
};

// GET sale by ID
exports.getSaleById = async (req, res) => {
  try {
    const sale = await populateSale(Sale.findById(req.params.id));
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json(sale);
  } catch (err) {
    reportError(req, err, 'Error fetching sale');
    res.status(500).json({ error: 'Server error fetching sale' });
  }
};

// GET sales report by date range
exports.getSalesReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    const sales = await populateSale(Sale.find(query));
    res.json(sales);
  } catch (err) {
    reportError(req, err, 'Error fetching sales report');
    res.status(500).json({ error: 'Server error fetching sales report' });
  }
};

// POST process a return/refund for one or more line items on a sale.
// Restocks the returned quantities and marks the sale partially_returned or
// returned depending on whether every line has now been fully returned.
const RETURN_DESTINATIONS = ['cash', 'original_payment', 'store_credit'];

exports.returnSale = async (req, res) => {
  const { items, destination } = req.body; // [{ variant: id, quantity }]
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items specified for return' });
  }
  if (!RETURN_DESTINATIONS.includes(destination)) {
    return res.status(400).json({ error: `destination must be one of: ${RETURN_DESTINATIONS.join(', ')}` });
  }

  const session = await mongoose.startSession();
  try {
    let sale;
    let refundAmount = 0;

    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale) throw new HttpError(404, 'Sale not found');
      if (sale.status === 'returned') throw new HttpError(400, 'This sale has already been fully returned');
      if (destination === 'store_credit' && !sale.customer) {
        throw new HttpError(400, "Sale has no customer on file — can't credit store balance");
      }

      for (const { variant: variantId, quantity } of items) {
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw new HttpError(400, 'Return quantity must be a positive whole number');
        }

        const line = sale.items.find(i => i.variant.toString() === variantId);
        if (!line) throw new HttpError(400, `Sale does not contain variant ${variantId}`);

        const remaining = line.quantity - (line.returnedQuantity || 0);
        if (quantity > remaining) {
          throw new HttpError(400, `Cannot return ${quantity} of ${line.styleName} (${line.size}/${line.color}) — only ${remaining} eligible for return`);
        }

        refundAmount += line.unitPrice * quantity * (1 - line.discount / 100);
        line.returnedQuantity = (line.returnedQuantity || 0) + quantity;

        await Variant.findByIdAndUpdate(variantId, { $inc: { stock: quantity } }, { session });
      }

      // Same cart-level discount applied at sale time, applied to the refunded portion
      refundAmount = refundAmount * (1 - (sale.cartDiscount || 0) / 100);

      const allReturned = sale.items.every(i => (i.returnedQuantity || 0) >= i.quantity);
      sale.status = allReturned ? 'returned' : 'partially_returned';
      sale.refundedAmount = (sale.refundedAmount || 0) + refundAmount;

      sale.returns.push({
        destination,
        amount: refundAmount,
        items: items.map(({ variant, quantity }) => ({ variant, quantity })),
        processedBy: req.user.id,
      });

      await sale.save({ session });

      if (destination === 'store_credit') {
        await Customer.findByIdAndUpdate(sale.customer, { $inc: { storeCreditBalance: refundAmount } }, { session });
        await StoreCreditLedger.create([{
          customer: sale.customer,
          amount: refundAmount,
          reason: 'return_refund',
          relatedSale: sale._id,
          relatedReturn: sale.returns[sale.returns.length - 1]._id,
          createdBy: req.user.id,
        }], { session });
      }
    });

    logAudit({
      action: 'sale_return_processed',
      details: { saleId: sale._id, destination, refundAmount, status: sale.status },
      userId: req.user.id,
    });

    const populatedSale = await populateSale(Sale.findById(sale._id));
    res.json({ sale: populatedSale, refundAmount: parseFloat(refundAmount.toFixed(2)) });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    reportError(req, err, 'Error processing return');
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// DELETE sale by ID
exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    logAudit({ action: 'sale_deleted', details: { saleId: sale._id, totalAmount: sale.totalAmount }, userId: req.user.id });
    res.json({ message: 'Sale deleted' });
  } catch (err) {
    reportError(req, err, 'Error deleting sale');
    res.status(500).json({ error: 'Server error deleting sale' });
  }
};
