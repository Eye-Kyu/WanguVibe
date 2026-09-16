const Sale = require('../models/Sale');
const Style = require('../models/Style');
const Variant = require('../models/Variant');
const { reportError } = require('../utils/reportError');

function paginationParams(req) {
  const { page = 1, limit = 25 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  return { pageNum, limitNum };
}

// GET /api/v1/sales — for accounting export. A read-only, deliberately
// narrow projection: no customer/cashier internals, just what an
// accounting system needs to reconcile revenue.
exports.getSales = async (req, res) => {
  try {
    const { pageNum, limitNum } = paginationParams(req);
    const [sales, total] = await Promise.all([
      Sale.find({}, 'totalAmount paymentMethod status refundedAmount createdAt items.quantity')
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Sale.countDocuments(),
    ]);
    const data = sales.map((s) => ({
      id: s._id,
      totalAmount: s.totalAmount,
      paymentMethod: s.paymentMethod,
      status: s.status,
      refundedAmount: s.refundedAmount || 0,
      itemCount: s.items.reduce((sum, i) => sum + i.quantity, 0),
      createdAt: s.createdAt,
    }));
    res.json({ data, page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    reportError(req, err, 'Public API: error fetching sales');
    res.status(500).json({ error: 'Server error fetching sales' });
  }
};

// GET /api/v1/styles — for storefront catalog sync.
exports.getStyles = async (req, res) => {
  try {
    const { pageNum, limitNum } = paginationParams(req);
    const [styles, total] = await Promise.all([
      Style.find({}, 'name styleCode brand category basePrice active')
        .sort({ name: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Style.countDocuments(),
    ]);
    res.json({ data: styles, page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    reportError(req, err, 'Public API: error fetching styles');
    res.status(500).json({ error: 'Server error fetching styles' });
  }
};

// GET /api/v1/variants — for storefront stock-level sync.
exports.getVariants = async (req, res) => {
  try {
    const { pageNum, limitNum } = paginationParams(req);
    const [variants, total] = await Promise.all([
      Variant.find({}, 'style size color sku barcode stock priceOverride active')
        .sort({ sku: 1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Variant.countDocuments(),
    ]);
    res.json({ data: variants, page: pageNum, limit: limitNum, total, pages: Math.ceil(total / limitNum) });
  } catch (err) {
    reportError(req, err, 'Public API: error fetching variants');
    res.status(500).json({ error: 'Server error fetching variants' });
  }
};
