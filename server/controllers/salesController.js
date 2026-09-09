const Variant = require('../models/Variant');
const Style = require('../models/Style');
const Sale = require('../models/Sale');

// POST create new sale
exports.createSale = async (req, res) => {
  const { items, totalAmount, cartDiscount, paymentMethod, customer } = req.body;
  try {
    // Validate inputs
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid or empty items' });
    }
    if (!totalAmount || totalAmount <= 0) {
      return res.status(400).json({ error: 'Invalid total amount' });
    }

    // Normalize payment method: accept 'Cash', 'M-Pesa', 'Card', 'cash', 'mpesa', 'card', etc.
    const methodNorm = (paymentMethod || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!['cash', 'mpesa', 'card'].includes(methodNorm)) {
      return res.status(400).json({ error: `Invalid payment method: "${paymentMethod}"` });
    }
    const normalizedPaymentMethod = methodNorm;

    if ((cartDiscount ?? 0) < 0 || (cartDiscount ?? 0) > 100) {
      return res.status(400).json({ error: 'Cart discount must be between 0 and 100%' });
    }
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    // Validate stock/discounts and build denormalized line items
    let calculatedTotal = 0;
    const builtItems = [];
    for (const item of items) {
      const variant = await Variant.findById(item.variant).populate('style', 'name basePrice');
      if (!variant) {
        return res.status(404).json({ error: `Variant ${item.variant} not found` });
      }
      if (!variant.style) {
        return res.status(404).json({ error: `Style for variant ${item.variant} not found` });
      }
      if (variant.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${variant.style.name} (${variant.size}/${variant.color}). Only ${variant.stock} available.`
        });
      }
      if (item.discount < 0 || item.discount > 100) {
        return res.status(400).json({ error: `Discount for ${variant.style.name} must be between 0 and 100%` });
      }

      const unitPrice = variant.priceOverride ?? variant.style.basePrice;
      const itemTotal = unitPrice * item.quantity * (1 - item.discount / 100);
      calculatedTotal += itemTotal;

      builtItems.push({
        variant: variant._id,
        styleName: variant.style.name,
        size: variant.size,
        color: variant.color,
        unitPrice,
        quantity: item.quantity,
        discount: item.discount || 0,
      });
    }

    calculatedTotal = calculatedTotal * (1 - (cartDiscount ?? 0) / 100);
    if (Math.abs(calculatedTotal - totalAmount) > 0.5) {
      return res.status(400).json({ error: 'Total amount does not match calculated total' });
    }

    const sale = new Sale({
      items: builtItems,
      customer: customer || null,
      totalAmount,
      cartDiscount: cartDiscount ?? 0,
      paymentMethod: normalizedPaymentMethod,
      cashier: req.user.id,
    });

    await Promise.all(
      builtItems.map(item =>
        Variant.findByIdAndUpdate(item.variant, { $inc: { stock: -item.quantity } })
      )
    );

    await sale.save();
    const populatedSale = await Sale.findById(sale._id)
      .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
      .populate('cashier', 'name')
      .populate('customer', 'name phone');

    if (!populatedSale.cashier) {
      return res.status(400).json({ error: 'Cashier information not found' });
    }

    res.status(201).json(populatedSale);
  } catch (err) {
    console.error('Error creating sale:', err);
    res.status(400).json({ error: err.message });
  }
};

// GET all sales
exports.getAllSales = async (req, res) => {
  try {
    const { limit } = req.query;
    const query = limit ? Sale.find().sort({ createdAt: -1 }).limit(parseInt(limit)) : Sale.find().sort({ createdAt: -1 });
    const sales = await query
      .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
      .populate('cashier', 'name')
      .populate('customer', 'name phone');
    res.json(sales);
  } catch (err) {
    console.error('Error fetching sales:', err);
    res.status(500).json({ error: 'Server error fetching sales' });
  }
};

// GET sale by ID
exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
      .populate('cashier', 'name')
      .populate('customer', 'name phone');
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json(sale);
  } catch (err) {
    console.error('Error fetching sale:', err);
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
    const sales = await Sale.find(query)
      .populate({ path: 'items.variant', select: 'sku barcode size color', populate: { path: 'style', select: 'name images' } })
      .populate('cashier', 'name')
      .populate('customer', 'name phone');
    res.json(sales);
  } catch (err) {
    console.error('Error fetching sales report:', err);
    res.status(500).json({ error: 'Server error fetching sales report' });
  }
};

// DELETE sale by ID
exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json({ message: 'Sale deleted' });
  } catch (err) {
    console.error('Error deleting sale:', err);
    res.status(500).json({ error: 'Server error deleting sale' });
  }
};
