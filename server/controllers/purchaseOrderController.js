const mongoose = require('mongoose');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Variant = require('../models/Variant');
const InventoryLog = require('../models/InventoryLog');
const HttpError = require('../utils/httpError');
const { logAudit } = require('../utils/auditLogger');
const { reportError } = require('../utils/reportError');

const populatePO = (query) => query
  .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
  .populate('supplier', 'name contactName phone')
  .populate('createdBy', 'name');

// POST /api/purchase-orders — items reference existing Variants only;
// ordering something not yet in the catalog is out of scope for v1.
exports.createPurchaseOrder = async (req, res) => {
  try {
    const { supplier, items, expectedDate, notes } = req.body;
    if (!supplier) return res.status(400).json({ error: 'A supplier is required' });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Invalid or empty items' });

    const supplierDoc = await Supplier.findById(supplier);
    if (!supplierDoc) return res.status(404).json({ error: 'Supplier not found' });

    const builtItems = [];
    for (const item of items) {
      if (!item.quantityOrdered || item.quantityOrdered <= 0) {
        return res.status(400).json({ error: 'Each item must have a quantity greater than 0' });
      }
      if (item.unitCost === undefined || item.unitCost === null || item.unitCost < 0) {
        return res.status(400).json({ error: 'Each item must have a unit cost of 0 or more' });
      }
      const variant = await Variant.findById(item.variant).populate('style', 'name');
      if (!variant) return res.status(404).json({ error: `Variant ${item.variant} not found` });
      if (!variant.style) return res.status(404).json({ error: `Style for variant ${item.variant} not found` });

      builtItems.push({
        variant: variant._id,
        styleName: variant.style.name,
        size: variant.size,
        color: variant.color,
        quantityOrdered: item.quantityOrdered,
        unitCost: item.unitCost,
      });
    }

    const po = await PurchaseOrder.create({
      supplier,
      items: builtItems,
      expectedDate: expectedDate || null,
      notes: notes || '',
      createdBy: req.user.id,
    });

    logAudit({ action: 'purchase_order_created', details: { purchaseOrderId: po._id, supplier, itemCount: builtItems.length }, userId: req.user.id });
    const populated = await populatePO(PurchaseOrder.findById(po._id));
    res.status(201).json(populated);
  } catch (err) {
    reportError(req, err, 'Error creating purchase order');
    res.status(400).json({ error: err.message || 'Failed to create purchase order' });
  }
};

// POST /api/purchase-orders/:id/receive — body: { items: [{ variant, quantity }] }.
// Supports partial/multiple receiving calls over time (a PO rarely arrives
// in one shipment). Each call only ever adds to quantityReceived — never
// resets or overwrites it.
exports.receivePurchaseOrder = async (req, res) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No items specified to receive' });
  }

  try {
    const session = await mongoose.startSession();
    let po;
    try {
      await session.withTransaction(async () => {
        po = await PurchaseOrder.findById(req.params.id).session(session);
        if (!po) throw new HttpError(404, 'Purchase order not found');
        if (po.status === 'received' || po.status === 'cancelled') {
          throw new HttpError(400, `This purchase order is ${po.status} — nothing left to receive`);
        }

        for (const { variant: variantId, quantity } of items) {
          if (!Number.isInteger(quantity) || quantity <= 0) {
            throw new HttpError(400, 'Receive quantity must be a positive whole number');
          }
          const line = po.items.find((i) => i.variant.toString() === variantId);
          if (!line) throw new HttpError(400, `This purchase order does not contain variant ${variantId}`);

          const remaining = line.quantityOrdered - line.quantityReceived;
          if (quantity > remaining) {
            throw new HttpError(400, `Cannot receive ${quantity} of ${line.styleName} (${line.size}/${line.color}) — only ${remaining} still outstanding`);
          }

          line.quantityReceived += quantity;
          await Variant.findByIdAndUpdate(variantId, { $inc: { stock: quantity } }, { session });
          await InventoryLog.create([{
            variant: variantId,
            quantity,
            action: 'purchase_order',
            relatedPurchaseOrder: po._id,
            user: req.user.id,
          }], { session });
        }

        const allReceived = po.items.every((i) => i.quantityReceived >= i.quantityOrdered);
        po.status = allReceived ? 'received' : 'partially_received';
        await po.save({ session });
      });
    } finally {
      session.endSession();
    }

    logAudit({ action: 'purchase_order_received', details: { purchaseOrderId: po._id, items, status: po.status }, userId: req.user.id });
    const populated = await populatePO(PurchaseOrder.findById(po._id));
    res.json(populated);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    reportError(req, err, 'Error receiving purchase order');
    res.status(400).json({ error: err.message || 'Failed to receive purchase order' });
  }
};

// POST /api/purchase-orders/:id/cancel — never reverses stock already
// received (that's already really in inventory); just marks nothing further
// is coming.
exports.cancelPurchaseOrder = async (req, res) => {
  try {
    const po = await PurchaseOrder.findById(req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    if (po.status !== 'ordered' && po.status !== 'partially_received') {
      return res.status(400).json({ error: `Cannot cancel a purchase order that is ${po.status}` });
    }

    po.status = 'cancelled';
    await po.save();

    logAudit({ action: 'purchase_order_cancelled', details: { purchaseOrderId: po._id }, userId: req.user.id });
    const populated = await populatePO(PurchaseOrder.findById(po._id));
    res.json(populated);
  } catch (err) {
    reportError(req, err, 'Error cancelling purchase order');
    res.status(400).json({ error: err.message || 'Failed to cancel purchase order' });
  }
};

exports.getAllPurchaseOrders = async (req, res) => {
  try {
    const { page = 1, limit = 25, status } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const query = status ? { status } : {};

    const [purchaseOrders, total] = await Promise.all([
      populatePO(PurchaseOrder.find(query).sort({ createdAt: -1 }).skip((pageNum - 1) * limitNum).limit(limitNum)),
      PurchaseOrder.countDocuments(query),
    ]);

    res.json({ purchaseOrders, total, page: pageNum, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    reportError(req, err, 'Error fetching purchase orders');
    res.status(500).json({ error: 'Server error fetching purchase orders' });
  }
};

exports.getPurchaseOrderById = async (req, res) => {
  try {
    const po = await populatePO(PurchaseOrder.findById(req.params.id));
    if (!po) return res.status(404).json({ error: 'Purchase order not found' });
    res.json(po);
  } catch (err) {
    reportError(req, err, 'Error fetching purchase order');
    res.status(500).json({ error: 'Server error fetching purchase order' });
  }
};
