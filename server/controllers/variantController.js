const Variant = require('../models/Variant');
const Style = require('../models/Style');
const { logAudit } = require('../utils/auditLogger');

// Add a variant to an existing style (the admin "add a size/color" action)
exports.createVariant = async (req, res) => {
  try {
    const style = await Style.findById(req.params.styleId);
    if (!style) return res.status(404).json({ error: 'Style not found' });

    const { size, color, sku, barcode, stock, priceOverride, reorderThreshold } = req.body;
    const variant = new Variant({
      style: style._id,
      size,
      color,
      sku,
      barcode: barcode?.trim() || undefined,
      stock: stock || 0,
      priceOverride: priceOverride ?? null,
      reorderThreshold: reorderThreshold ?? 2,
    });
    await variant.save();
    logAudit({ action: 'variant_created', details: { variantId: variant._id, styleId: style._id, size, color, sku }, userId: req.user.id });
    res.status(201).json(variant);
  } catch (err) {
    console.error('Error creating variant:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'That size/color already exists for this style, or the SKU/barcode is already in use' });
    }
    res.status(400).json({ error: 'Invalid variant data' });
  }
};

exports.getVariantsForStyle = async (req, res) => {
  try {
    const variants = await Variant.find({ style: req.params.styleId });
    res.json(variants);
  } catch (err) {
    console.error('Error fetching variants:', err);
    res.status(500).json({ error: 'Server error fetching variants' });
  }
};

exports.updateVariant = async (req, res) => {
  try {
    const { size, color, sku, barcode, stock, priceOverride, reorderThreshold, active } = req.body;
    const setFields = { size, color, sku, stock, priceOverride, reorderThreshold, active };
    Object.keys(setFields).forEach(k => setFields[k] === undefined && delete setFields[k]);

    let updateOp;
    if (barcode && barcode.trim()) {
      setFields.barcode = barcode.trim();
      updateOp = { $set: setFields };
    } else if (barcode === '') {
      updateOp = { $set: setFields, $unset: { barcode: 1 } };
    } else {
      updateOp = { $set: setFields };
    }

    const updated = await Variant.findByIdAndUpdate(req.params.id, updateOp, { new: true });
    if (!updated) return res.status(404).json({ error: 'Variant not found' });
    logAudit({ action: 'variant_updated', details: { variantId: updated._id, changes: setFields }, userId: req.user.id });
    res.json(updated);
  } catch (err) {
    console.error('Error updating variant:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'That SKU, barcode, or size/color combination is already in use' });
    }
    res.status(400).json({ error: 'Invalid update data' });
  }
};

exports.deleteVariant = async (req, res) => {
  try {
    const deleted = await Variant.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Variant not found' });
    logAudit({ action: 'variant_deleted', details: { variantId: deleted._id, sku: deleted.sku }, userId: req.user.id });
    res.json({ message: 'Variant deleted' });
  } catch (err) {
    console.error('Error deleting variant:', err);
    res.status(400).json({ error: 'Error deleting variant' });
  }
};

// Resolve a scanned/typed barcode straight to its variant + style — this is
// what lets the POS skip the size/color picker when a garment is scanned.
exports.lookupByBarcode = async (req, res) => {
  try {
    const { barcode } = req.query;
    if (!barcode) return res.status(400).json({ error: 'barcode query param required' });
    const variant = await Variant.findOne({ barcode: barcode.trim() }).populate('style');
    if (!variant) return res.status(404).json({ error: `No variant found for barcode: ${barcode}` });
    res.json(variant);
  } catch (err) {
    console.error('Error looking up barcode:', err);
    res.status(500).json({ error: 'Server error looking up barcode' });
  }
};

// Low stock is per-variant and uses each variant's own reorderThreshold,
// since "low" for a boutique (e.g. fewer than 2 of a size/color left) is a
// very different number than a mini-mart's flat "< 10" check.
exports.getLowStockVariants = async (req, res) => {
  try {
    const variants = await Variant.find({ $expr: { $lt: ['$stock', '$reorderThreshold'] }, active: true })
      .populate('style', 'name styleCode category');
    res.json(variants);
  } catch (err) {
    console.error('Error fetching low stock variants:', err);
    res.status(500).json({ error: 'Server error fetching low stock variants' });
  }
};
