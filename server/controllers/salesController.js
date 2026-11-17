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
const { isPositiveAmount, normalizeLineItems, normalizeCartDiscount, assertTotalMatches } = require('../utils/saleValidation');
const { assertDiscountAllowed, resolveApproval } = require('../utils/approval');
const { sendSms } = require('../services/sms');
const { toE164Kenya, maskPhone } = require('../utils/phone');
const { generateGiftCardCode } = require('../utils/giftCard');
const { submitInvoice } = require('../services/etims');
const { reportError } = require('../utils/reportError');
const { refetchAndBroadcast } = require('../services/stockBroadcast');
const { triggerWebhookEvent } = require('../services/webhooks');

const PAYMENT_METHODS = ['cash', 'mpesa', 'card', 'store_credit', 'gift_card'];

const populateSale = (query) => query
  .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
  .populate('cashier', 'name')
  .populate('customer', 'name phone');

// Turns whatever payment shape the caller used into one canonical array —
// either a caller-supplied `payments: [{method, amount, customer?,
// giftCardCode?}]` (the split-tender path) or the legacy flat
// `paymentMethod`/`customer`/`giftCardCode` args wrapped into a single-entry
// array. Every existing caller (all synchronous single-method sales, the
// M-Pesa callback path) goes through the wrapped branch unchanged. Throws
// HttpError on any validation failure; otherwise every downstream check in
// finalizeSale operates uniformly on the returned array regardless of which
// input shape was used.
function normalizePayments({ paymentMethod, customer, giftCardCode, totalAmount, payments }) {
  const normalizeMethod = (m) => (m || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');

  let normalized;
  if (Array.isArray(payments) && payments.length > 0) {
    normalized = payments.map((p) => ({
      method: normalizeMethod(p.method),
      amount: p.amount,
      customer: p.customer || null,
      giftCardCode: p.giftCardCode || null,
    }));
  } else {
    const methodNorm = normalizeMethod(paymentMethod);
    normalized = [{ method: methodNorm, amount: totalAmount, customer: customer || null, giftCardCode: giftCardCode || null }];
  }

  for (const p of normalized) {
    if (!PAYMENT_METHODS.includes(p.method)) {
      throw new HttpError(400, `Invalid payment method: "${p.method}"`);
    }
    if (!isPositiveAmount(p.amount)) {
      throw new HttpError(400, 'Each payment line must have an amount greater than 0');
    }
    if (p.method === 'store_credit' && !p.customer) {
      throw new HttpError(400, 'A customer must be selected to pay with store credit');
    }
    if (p.method === 'gift_card' && !p.giftCardCode) {
      throw new HttpError(400, 'A gift card code is required');
    }
  }

  if (normalized.length > 1) {
    if (normalized.some((p) => p.method === 'mpesa')) {
      throw new HttpError(400, 'M-Pesa cannot be combined with other payment methods in a split-tender sale');
    }
    // Both are keyed off a single balance/field on the Sale doc
    // (giftCardRedeemed, and there's only one customer per sale) — a second
    // line of either would just be redundant with the first, not a real
    // extra capability, so it's simpler to disallow than to generalize.
    if (normalized.filter((p) => p.method === 'store_credit').length > 1) {
      throw new HttpError(400, 'Only one store-credit payment line is allowed per sale');
    }
    if (normalized.filter((p) => p.method === 'gift_card').length > 1) {
      throw new HttpError(400, 'Only one gift-card payment line is allowed per sale');
    }
  }

  return normalized;
}

// Validates and commits a sale — stock decrement, the Sale record itself,
// and (for store-credit/gift-card payments or gift-card sales) a customer's
// balance and gift card balances, all in one transaction. This is the one
// place "a sale is finalized" happens, shared by the synchronous HTTP path
// (createSale, below) and the async M-Pesa callback path (paymentsController)
// — neither redefines what finalizing a sale means on its own. Throws
// HttpError on any validation/business-rule failure; returns the saved
// (unpopulated) Sale doc on success.

// Submits an already-saved Sale to eTIMS and records the outcome — pulled
// out of finalizeSale so a layaway's completion (which builds and saves its
// own Sale directly, without going through finalizeSale at all, since stock
// was already decremented when the layaway was created) can submit it the
// same way every other sale does, without duplicating this logic.
// Deliberately never undoes or blocks the sale itself — a boutique can't
// stop selling because a government API is down. A failure queues the
// invoice for manual admin retry instead of blocking or silently dropping it.
async function submitSaleToEtims(sale, { simulateEtimsFailure } = {}) {
  try {
    const etimsResult = await submitInvoice(sale, { simulateFailure: simulateEtimsFailure });
    if (etimsResult.status === 'accepted') {
      sale.etimsStatus = 'accepted';
      sale.etimsInvoiceNumber = etimsResult.invoiceNumber;
      sale.etimsQrPayload = etimsResult.qrPayload;
      sale.etimsSubmittedAt = new Date();
      await sale.save();
    } else {
      // 'unreachable' is transient and the sweep retries it; 'rejected'
      // means KRA refused the data itself, so it's parked for a human
      // (abandoned) instead of being resent unchanged every 5 minutes.
      const rejected = etimsResult.status === 'rejected';
      sale.etimsStatus = rejected ? 'rejected' : 'unreachable';
      await sale.save();
      await EtimsRetryQueue.findOneAndUpdate(
        { sale: sale._id },
        { $set: { lastError: etimsResult.error, lastAttemptAt: new Date(), status: rejected ? 'abandoned' : 'pending' }, $inc: { attempts: 1 } },
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
}
exports.submitSaleToEtims = submitSaleToEtims;

// cashierRole/approvedBy are trusted server-side context — callers must
// never pass them through from a request body (see createSale).
const isValidClientSaleId = (id) => typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id);

// Replay of an already-saved sale (same till-generated key, same cashier):
// return the original rather than charging/decrementing twice.
async function findReplayedSale(clientSaleId, cashier) {
  if (!isValidClientSaleId(clientSaleId)) return null;
  return Sale.findOne({ clientSaleId, cashier });
}

async function finalizeSale({ items: rawItems, totalAmount, cartDiscount: rawCartDiscount, paymentMethod, customer, shift, giftCardsSold, giftCardCode, cashier, cashierRole, approvedBy, simulateEtimsFailure, payments, clientSaleId }) {
  const items = normalizeLineItems(rawItems);
  if (!isPositiveAmount(totalAmount)) {
    throw new HttpError(400, 'Invalid total amount');
  }
  const normalizedPayments = normalizePayments({ paymentMethod, customer, giftCardCode, totalAmount, payments });
  const paymentsSum = normalizedPayments.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(paymentsSum - totalAmount) > 0.5) {
    throw new HttpError(400, 'Payment amounts do not sum to the total amount');
  }
  const cartDiscount = normalizeCartDiscount(rawCartDiscount);
  if (!cashier) {
    throw new HttpError(401, 'User authentication required');
  }
  assertDiscountAllowed(items, cartDiscount, { role: cashierRole, approvedBy });
  if (clientSaleId !== undefined && clientSaleId !== null && !isValidClientSaleId(clientSaleId)) {
    throw new HttpError(400, 'clientSaleId must be 8–64 letters, digits or dashes');
  }
  const cardsToSell = Array.isArray(giftCardsSold) ? giftCardsSold : [];
  for (const gc of cardsToSell) {
    if (!isPositiveAmount(gc?.amount)) {
      throw new HttpError(400, 'Gift card amount must be greater than 0');
    }
  }

  const session = await mongoose.startSession();
  try {
    let sale;
    const auditExtras = [];
    const changedVariantIds = [];

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
        const unitPrice = variant.priceOverride ?? variant.style.basePrice;
        calculatedTotal += unitPrice * item.quantity * (1 - item.discount / 100);

        builtItems.push({
          variant: variant._id,
          styleName: variant.style.name,
          size: variant.size,
          color: variant.color,
          unitPrice,
          quantity: item.quantity,
          discount: item.discount,
        });

        // Guarded decrement — the stock check and the write are one atomic
        // operation, so two concurrent sales can't both pass the check.
        const decremented = await Variant.findOneAndUpdate(
          { _id: variant._id, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session }
        );
        if (!decremented) {
          throw new HttpError(400, `Insufficient stock for ${variant.style.name} (${variant.size}/${variant.color}). Only ${variant.stock} available.`);
        }
        changedVariantIds.push(variant._id);
      }

      calculatedTotal = calculatedTotal * (1 - cartDiscount / 100);

      // Gift cards sold are added at face value, after the merchandise
      // discount — a gift card isn't merchandise and shouldn't be discounted.
      const giftCardsTotal = cardsToSell.reduce((s, gc) => s + gc.amount, 0);
      calculatedTotal += giftCardsTotal;

      assertTotalMatches(calculatedTotal, totalAmount);

      sale = new Sale({
        items: builtItems,
        customer: customer || null,
        totalAmount,
        cartDiscount,
        paymentMethod: normalizedPayments.length === 1 ? normalizedPayments[0].method : 'split',
        payments: normalizedPayments,
        cashier,
        approvedBy: approvedBy || null,
        clientSaleId: clientSaleId || undefined,
        shift: shift || null,
      });

      // Cash/card payment lines need no special handling — the money's
      // already in hand/processed by the terminal by the time this runs.
      // Store-credit and gift-card lines each run the same atomic-guarded
      // debit/redemption as before, just once per matching line instead of
      // once per sale (normalizePayments already guarantees at most one of
      // each, so this never double-touches the same balance/card).
      for (const line of normalizedPayments) {
        // ── Payment: store credit — atomic guarded debit, aborts the whole
        // transaction (via null → throw) if the balance is insufficient ──
        if (line.method === 'store_credit') {
          const debited = await Customer.findOneAndUpdate(
            { _id: line.customer, storeCreditBalance: { $gte: line.amount } },
            { $inc: { storeCreditBalance: -line.amount } },
            { session }
          );
          if (!debited) throw new HttpError(400, 'Insufficient store credit balance');

          await StoreCreditLedger.create([{
            customer: line.customer,
            amount: -line.amount,
            reason: 'checkout_payment',
            relatedSale: sale._id,
            createdBy: cashier,
          }], { session });
          auditExtras.push({ action: 'store_credit_payment', details: { saleId: sale._id, customerId: line.customer, amount: line.amount } });
        }

        // ── Payment: gift card redemption — guarded, atomic, conditionally
        // flips status to 'redeemed' once the balance hits 0. A redemption
        // must cover this line's amount in full (the card's own balance can
        // exceed it — the rest just stays on the card for later) ──
        if (line.method === 'gift_card') {
          const normalizedCode = line.giftCardCode.trim().toUpperCase();
          const redeemed = await GiftCard.findOneAndUpdate(
            { code: normalizedCode, status: 'active', currentBalance: { $gte: line.amount } },
            [
              { $set: { currentBalance: { $subtract: ['$currentBalance', line.amount] } } },
              { $set: { status: { $cond: [{ $lte: ['$currentBalance', 0] }, 'redeemed', '$status'] } } },
            ],
            { session, new: true }
          );
          if (!redeemed) throw new HttpError(400, 'Gift card not found, inactive, or insufficient balance');

          sale.giftCardRedeemed = { code: redeemed.code, amount: line.amount };
          auditExtras.push({ action: 'gift_card_redeemed', details: { saleId: sale._id, code: redeemed.code, amount: line.amount, remainingBalance: redeemed.currentBalance } });
        }
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

    refetchAndBroadcast(changedVariantIds);

    // Known v1 gap, documented in the Tier 4 plan: a Sale created via
    // completeLayaway (which saves a Sale directly, not through this
    // function) does not fire this event.
    triggerWebhookEvent('sale.completed', {
      saleId: sale._id,
      totalAmount: sale.totalAmount,
      paymentMethod: sale.paymentMethod,
      itemCount: sale.items.length,
      createdAt: sale.createdAt,
    }).catch((err) => reportError(null, err, 'sale.completed webhook trigger failed'));

    await submitSaleToEtims(sale, { simulateEtimsFailure });

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
    // Strip anything the server sets itself so a client can't claim an
    // approval or role it doesn't have.
    // eslint-disable-next-line no-unused-vars
    const { approval, approvedBy, cashierRole, cashier, ...body } = req.body || {};
    const replay = await findReplayedSale(body.clientSaleId, req.user.id);
    if (replay) return res.status(200).json(await populateSale(Sale.findById(replay._id)));

    const verifiedApprover = await resolveApproval(req.body);
    const sale = await finalizeSale({ ...body, cashier: req.user.id, cashierRole: req.user.role, approvedBy: verifiedApprover });
    if (verifiedApprover) {
      logAudit({ action: 'discount_approved', details: { saleId: sale._id, approvedBy: verifiedApprover }, userId: req.user.id });
    }
    const populatedSale = await populateSale(Sale.findById(sale._id));
    if (!populatedSale.cashier) {
      return res.status(400).json({ error: 'Cashier information not found' });
    }
    res.status(201).json(populatedSale);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(HttpError.body(err));
    if (err.code === 11000 && err.keyPattern?.clientSaleId) {
      // Two copies of the same sale raced; the other one won — return it.
      const replay = await findReplayedSale(req.body?.clientSaleId, req.user.id);
      if (replay) return res.status(200).json(await populateSale(Sale.findById(replay._id)));
      return res.status(409).json({ error: 'That sale reference is already in use' });
    }
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
    const changedVariantIds = [];

    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale) throw new HttpError(404, 'Sale not found');
      if (sale.status === 'returned') throw new HttpError(400, 'This sale has already been fully returned');
      if (sale.status === 'voided') throw new HttpError(400, 'This sale has been voided');
      if (destination === 'store_credit' && !sale.customer) {
        throw new HttpError(400, "Sale has no customer on file — can't credit store balance");
      }
      // A split-tender sale has no single "original payment method" to
      // refund to — cash and store_credit are always unambiguous, so those
      // stay available.
      if (destination === 'original_payment' && sale.paymentMethod === 'split') {
        throw new HttpError(400, "This sale was split across multiple payment methods — choose 'cash' or 'store_credit' instead of 'original_payment'");
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
        changedVariantIds.push(variantId);
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

    refetchAndBroadcast(changedVariantIds);

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

// POST /api/sales/:id/void — admin-only full reversal that keeps the record
// (sales are never hard-deleted: a deleted sale silently corrupted shift
// cash totals and erased the evidence of what happened). Restocks every
// item and sends each payment back the way it came:
//   cash -> a cash refund entry (so the open shift's expected cash drops)
//   store credit / gift card -> credited straight back to the balance
//   card / M-Pesa -> recorded as owed back via the original method
// Only a sale with no returns yet can be voided; anything else is a return.
exports.voidSale = async (req, res) => {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
  if (!reason) return res.status(400).json({ error: 'A reason is required to void a sale' });

  const session = await mongoose.startSession();
  try {
    let sale;
    const changedVariantIds = [];
    await session.withTransaction(async () => {
      sale = await Sale.findById(req.params.id).session(session);
      if (!sale) throw new HttpError(404, 'Sale not found');
      if (sale.status === 'voided') throw new HttpError(400, 'This sale is already voided');
      if (sale.status !== 'completed') {
        throw new HttpError(400, 'This sale already has returns — process a return for the remaining items instead');
      }

      // Gift cards sold on this sale can only be clawed back if untouched.
      for (const gc of sale.giftCardsSold || []) {
        const card = await GiftCard.findOneAndUpdate(
          { code: gc.code, status: 'active', $expr: { $eq: ['$currentBalance', '$initialBalance'] } },
          { $set: { status: 'void', currentBalance: 0 } },
          { session, new: true }
        );
        if (!card) throw new HttpError(400, `Gift card ${gc.code} from this sale has already been used — it can't be voided`);
      }

      for (const item of sale.items) {
        await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } }, { session });
        item.returnedQuantity = item.quantity;
        changedVariantIds.push(item.variant);
      }

      const lines = sale.payments?.length
        ? sale.payments
        : [{ method: sale.paymentMethod, amount: sale.totalAmount, customer: sale.customer }];
      for (const line of lines) {
        let destination = 'original_payment';
        if (line.method === 'cash') destination = 'cash';
        if (line.method === 'store_credit') {
          destination = 'store_credit';
          const customerId = line.customer || sale.customer;
          await Customer.findByIdAndUpdate(customerId, { $inc: { storeCreditBalance: line.amount } }, { session });
          await StoreCreditLedger.create([{
            customer: customerId, amount: line.amount, reason: 'void_reversal', relatedSale: sale._id, createdBy: req.user.id,
          }], { session });
        }
        if (line.method === 'gift_card') {
          const code = sale.giftCardRedeemed?.code || line.giftCardCode?.trim().toUpperCase();
          await GiftCard.findOneAndUpdate(
            { code },
            { $inc: { currentBalance: line.amount }, $set: { status: 'active' } },
            { session }
          );
        }
        sale.returns.push({ destination, amount: line.amount, items: [], processedBy: req.user.id });
      }
      // Gift cards sold were paid for too — that money goes back with the
      // rest (already included in the payment lines' total).
      sale.refundedAmount = sale.totalAmount;
      sale.status = 'voided';
      sale.void = { by: req.user.id, reason, at: new Date() };
      await sale.save({ session });
    });

    logAudit({ action: 'sale_voided', details: { saleId: sale._id, totalAmount: sale.totalAmount, reason }, userId: req.user.id });
    refetchAndBroadcast(changedVariantIds);
    const populatedSale = await populateSale(Sale.findById(sale._id));
    res.json(populatedSale);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(HttpError.body(err));
    reportError(req, err, 'Error voiding sale');
    res.status(400).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

const PAYMENT_LABELS = { cash: 'cash', card: 'card', mpesa: 'M-Pesa', store_credit: 'store credit', gift_card: 'gift card', split: 'split payment' };

function buildReceiptSms(sale) {
  const business = process.env.BUSINESS_NAME || 'Wanguvibe';
  const ref = sale._id.toString().slice(-8).toUpperCase();
  const amount = Number(sale.totalAmount).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const when = new Date(sale.createdAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' });
  const lines = sale.items.map((i) => `${i.quantity}x ${i.styleName} ${i.size}/${i.color}`);
  const itemsText = lines.length <= 3 ? lines.join(', ') : `${lines.slice(0, 2).join(', ')} +${lines.length - 2} more`;
  const parts = [
    `${business} receipt #${ref}`,
    `${itemsText}`,
    `Total KES ${amount} (${PAYMENT_LABELS[sale.paymentMethod] || sale.paymentMethod}), ${when}.`,
  ];
  if (sale.giftCardsSold?.length) parts.push(`Gift card: ${sale.giftCardsSold.map((g) => g.code).join(', ')}.`);
  if (sale.etimsInvoiceNumber) parts.push(`KRA invoice ${sale.etimsInvoiceNumber}.`);
  parts.push('Thank you!');
  return parts.join(' ');
}
exports.buildReceiptSms = buildReceiptSms;

// POST /api/sales/:id/send-receipt { phone? } — texts the receipt to the
// customer. Sent only when the cashier asks (the customer's consent at the
// till), to the phone given or else the sale's customer on file.
exports.sendReceiptSms = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate('customer', 'phone');
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    if (sale.status === 'voided') return res.status(400).json({ error: 'This sale has been voided' });

    const phone = req.body?.phone || sale.customer?.phone;
    if (!phone || !toE164Kenya(phone)) return res.status(400).json({ error: 'A valid Kenyan mobile number is required' });

    const result = await sendSms(phone, buildReceiptSms(sale));
    sale.receiptSms = { to: maskPhone(phone), at: new Date(), status: result.status };
    await sale.save();
    logAudit({ action: 'receipt_sms_sent', details: { saleId: sale._id, to: maskPhone(phone), status: result.status }, userId: req.user.id });

    if (result.status !== 'sent') return res.status(502).json({ error: `SMS could not be sent: ${result.error}` });
    res.json({ message: 'Receipt sent', to: maskPhone(phone) });
  } catch (err) {
    reportError(req, err, 'Error sending receipt SMS');
    res.status(500).json({ error: 'Server error sending receipt' });
  }
};
