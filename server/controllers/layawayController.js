const mongoose = require('mongoose');
const Layaway = require('../models/Layaway');
const Variant = require('../models/Variant');
const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const Sale = require('../models/Sale');
const StoreCreditLedger = require('../models/StoreCreditLedger');
const HttpError = require('../utils/httpError');
const { logAudit } = require('../utils/auditLogger');
const { reportError } = require('../utils/reportError');
const { submitSaleToEtims, populateSale } = require('./salesController');

const LAYAWAY_PAYMENT_METHODS = ['cash', 'card', 'store_credit', 'gift_card'];
const normalizeMethod = (m) => (m || '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z_]/g, '');

const populateLayaway = (query) => query
  .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
  .populate('customer', 'name phone')
  .populate('cashier', 'name')
  .populate('payments.cashier', 'name');

// Runs a single payment line's method-specific logic (store-credit debit /
// gift-card redemption — same atomic-guarded patterns as finalizeSale's
// per-line loop for split-tender). Cash/card need no special handling.
// Mutates and returns the line with whatever extra fields the method needs
// (customer for store_credit, the normalized code for gift_card). Throws
// HttpError on any failure — caller is expected to be inside a transaction.
async function applyPaymentLine({ method, amount, customer, giftCardCode, cashier, session }) {
  const line = { amount, method, cashier, paidAt: new Date() };

  if (method === 'store_credit') {
    const debited = await Customer.findOneAndUpdate(
      { _id: customer, storeCreditBalance: { $gte: amount } },
      { $inc: { storeCreditBalance: -amount } },
      { session }
    );
    if (!debited) throw new HttpError(400, 'Insufficient store credit balance');
    await StoreCreditLedger.create([{ customer, amount: -amount, reason: 'layaway_payment', createdBy: cashier }], { session });
    line.customer = customer;
  }

  if (method === 'gift_card') {
    const normalizedCode = giftCardCode.trim().toUpperCase();
    const redeemed = await GiftCard.findOneAndUpdate(
      { code: normalizedCode, status: 'active', currentBalance: { $gte: amount } },
      [
        { $set: { currentBalance: { $subtract: ['$currentBalance', amount] } } },
        { $set: { status: { $cond: [{ $lte: ['$currentBalance', 0] }, 'redeemed', '$status'] } } },
      ],
      { session, new: true }
    );
    if (!redeemed) throw new HttpError(400, 'Gift card not found, inactive, or insufficient balance');
    line.giftCardCode = redeemed.code;
  }

  return line;
}

// POST /api/layaways — reserves items against a deposit. Stock is
// decremented now (the items are physically set aside), not at completion.
exports.createLayaway = async (req, res) => {
  if (!req.user || !req.user.id) return res.status(401).json({ error: 'User authentication required' });
  const { items, totalAmount, cartDiscount, customer, dueDate, deposit } = req.body;

  try {
    if (!customer) throw new HttpError(400, 'A customer is required for a layaway');
    if (!items || !Array.isArray(items) || items.length === 0) throw new HttpError(400, 'Invalid or empty items');
    if (!totalAmount || totalAmount <= 0) throw new HttpError(400, 'Invalid total amount');
    if (!deposit || !deposit.amount || deposit.amount <= 0) throw new HttpError(400, 'A deposit amount greater than 0 is required');
    if (deposit.amount >= totalAmount) throw new HttpError(400, 'Deposit must be less than the total — pay in full as a normal sale instead');
    const methodNorm = normalizeMethod(deposit.method);
    if (!LAYAWAY_PAYMENT_METHODS.includes(methodNorm)) throw new HttpError(400, `Invalid payment method: "${deposit.method}"`);
    if (methodNorm === 'gift_card' && !deposit.giftCardCode) throw new HttpError(400, 'A gift card code is required');

    const session = await mongoose.startSession();
    let layaway;
    try {
      await session.withTransaction(async () => {
        const customerDoc = await Customer.findById(customer).session(session);
        if (!customerDoc) throw new HttpError(404, 'Customer not found');

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
        if (Math.abs(calculatedTotal - totalAmount) > 0.5) {
          throw new HttpError(400, 'Total amount does not match calculated total');
        }

        const depositLine = await applyPaymentLine({
          method: methodNorm,
          amount: deposit.amount,
          customer,
          giftCardCode: deposit.giftCardCode,
          cashier: req.user.id,
          session,
        });

        layaway = new Layaway({
          customer,
          items: builtItems,
          totalAmount,
          cartDiscount: cartDiscount ?? 0,
          payments: [depositLine],
          balanceRemaining: totalAmount - deposit.amount,
          dueDate: dueDate || null,
          cashier: req.user.id,
        });
        await layaway.save({ session });
      });
    } finally {
      session.endSession();
    }

    logAudit({ action: 'layaway_created', details: { layawayId: layaway._id, customer, totalAmount, deposit: deposit.amount }, userId: req.user.id });
    const populated = await populateLayaway(Layaway.findById(layaway._id));
    res.status(201).json(populated);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    reportError(req, err, 'Error creating layaway');
    res.status(400).json({ error: err.message });
  }
};

// POST /api/layaways/:id/payment — records an installment against the
// remaining balance.
exports.recordPayment = async (req, res) => {
  const { amount, method, giftCardCode } = req.body;

  try {
    const methodNorm = normalizeMethod(method);
    if (!LAYAWAY_PAYMENT_METHODS.includes(methodNorm)) throw new HttpError(400, `Invalid payment method: "${method}"`);
    if (!amount || amount <= 0) throw new HttpError(400, 'Payment amount must be greater than 0');
    if (methodNorm === 'gift_card' && !giftCardCode) throw new HttpError(400, 'A gift card code is required');

    const session = await mongoose.startSession();
    let layaway;
    try {
      await session.withTransaction(async () => {
        layaway = await Layaway.findById(req.params.id).session(session);
        if (!layaway) throw new HttpError(404, 'Layaway not found');
        if (layaway.status !== 'active') throw new HttpError(400, 'This layaway is not active');
        if (amount > layaway.balanceRemaining + 0.5) {
          throw new HttpError(400, `Payment of ${amount} exceeds the remaining balance of ${layaway.balanceRemaining.toFixed(2)}`);
        }

        const line = await applyPaymentLine({
          method: methodNorm,
          amount,
          customer: layaway.customer,
          giftCardCode,
          cashier: req.user.id,
          session,
        });

        layaway.payments.push(line);
        layaway.balanceRemaining = Math.max(0, layaway.balanceRemaining - amount);
        await layaway.save({ session });
      });
    } finally {
      session.endSession();
    }

    logAudit({ action: 'layaway_payment_recorded', details: { layawayId: layaway._id, amount, method: methodNorm, balanceRemaining: layaway.balanceRemaining }, userId: req.user.id });
    const populated = await populateLayaway(Layaway.findById(layaway._id));
    res.json(populated);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    reportError(req, err, 'Error recording layaway payment');
    res.status(400).json({ error: err.message });
  }
};

// POST /api/layaways/:id/complete — only once the balance is fully paid.
// Builds and saves a real Sale directly from the layaway's own items and
// payment history — does NOT go through finalizeSale, since stock was
// already decremented when the layaway was created and finalizeSale would
// decrement it again for the same items.
exports.completeLayaway = async (req, res) => {
  try {
    const session = await mongoose.startSession();
    let sale;
    try {
      await session.withTransaction(async () => {
        const layaway = await Layaway.findById(req.params.id).session(session);
        if (!layaway) throw new HttpError(404, 'Layaway not found');
        if (layaway.status !== 'active') throw new HttpError(400, 'This layaway is not active');
        if (layaway.balanceRemaining > 0.5) {
          throw new HttpError(400, `Balance of ${layaway.balanceRemaining.toFixed(2)} still owed — cannot complete until fully paid`);
        }

        const salePayments = layaway.payments.map((p) => ({ method: p.method, amount: p.amount, customer: p.customer, giftCardCode: p.giftCardCode }));
        sale = new Sale({
          items: layaway.items,
          customer: layaway.customer,
          totalAmount: layaway.totalAmount,
          cartDiscount: layaway.cartDiscount,
          paymentMethod: salePayments.length === 1 ? salePayments[0].method : 'split',
          payments: salePayments,
          cashier: req.user.id,
        });
        await sale.save({ session });

        layaway.status = 'completed';
        layaway.completedSale = sale._id;
        await layaway.save({ session });
      });
    } finally {
      session.endSession();
    }

    // eTIMS submission after commit, same convention as finalizeSale — a
    // completed layaway is a real sale of goods, submitted the same way.
    await submitSaleToEtims(sale, {});

    logAudit({ action: 'layaway_completed', details: { layawayId: req.params.id, saleId: sale._id }, userId: req.user.id });
    const [layaway, populatedSale] = await Promise.all([
      populateLayaway(Layaway.findById(req.params.id)),
      populateSale(Sale.findById(sale._id)),
    ]);
    res.json({ layaway, sale: populatedSale });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    reportError(req, err, 'Error completing layaway');
    res.status(400).json({ error: err.message });
  }
};

// POST /api/layaways/:id/cancel — restocks every item; per the chosen
// destination either forfeits payments already made (store keeps the
// money) or refunds them as store credit.
exports.cancelLayaway = async (req, res) => {
  const { destination } = req.body;
  if (!['forfeit', 'store_credit'].includes(destination)) {
    return res.status(400).json({ error: "destination must be one of: forfeit, store_credit" });
  }

  try {
    const session = await mongoose.startSession();
    let layaway;
    try {
      await session.withTransaction(async () => {
        layaway = await Layaway.findById(req.params.id).session(session);
        if (!layaway) throw new HttpError(404, 'Layaway not found');
        if (layaway.status !== 'active') throw new HttpError(400, 'This layaway is not active');

        for (const item of layaway.items) {
          await Variant.findByIdAndUpdate(item.variant, { $inc: { stock: item.quantity } }, { session });
        }

        if (destination === 'store_credit') {
          const totalPaid = layaway.payments.reduce((sum, p) => sum + p.amount, 0);
          if (totalPaid > 0) {
            await Customer.findByIdAndUpdate(layaway.customer, { $inc: { storeCreditBalance: totalPaid } }, { session });
            await StoreCreditLedger.create([{ customer: layaway.customer, amount: totalPaid, reason: 'layaway_refund', relatedLayaway: layaway._id, createdBy: req.user.id }], { session });
          }
        }

        layaway.status = 'cancelled';
        layaway.cancellation = { destination, processedBy: req.user.id, processedAt: new Date() };
        await layaway.save({ session });
      });
    } finally {
      session.endSession();
    }

    logAudit({ action: 'layaway_cancelled', details: { layawayId: layaway._id, destination }, userId: req.user.id });
    const populated = await populateLayaway(Layaway.findById(layaway._id));
    res.json(populated);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    reportError(req, err, 'Error cancelling layaway');
    res.status(400).json({ error: err.message });
  }
};

// GET /api/layaways — paginated, optionally filtered by status (same
// convention as GET /audit, /shifts).
exports.getAllLayaways = async (req, res) => {
  try {
    const { page = 1, limit = 25, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const query = status ? { status } : {};

    const [layaways, total] = await Promise.all([
      populateLayaway(
        Layaway.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum)
      ),
      Layaway.countDocuments(query),
    ]);

    res.json({ layaways, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    reportError(req, err, 'Error fetching layaways');
    res.status(500).json({ error: 'Server error fetching layaways' });
  }
};

exports.getLayawayById = async (req, res) => {
  try {
    const layaway = await populateLayaway(Layaway.findById(req.params.id));
    if (!layaway) return res.status(404).json({ error: 'Layaway not found' });
    res.json(layaway);
  } catch (err) {
    reportError(req, err, 'Error fetching layaway');
    res.status(500).json({ error: 'Server error fetching layaway' });
  }
};
