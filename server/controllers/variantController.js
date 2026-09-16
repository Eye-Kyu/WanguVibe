const Variant = require('../models/Variant');
const { reportError } = require('../utils/reportError');
const Style = require('../models/Style');
const Sale = require('../models/Sale');
const { logAudit } = require('../utils/auditLogger');

// How many trailing days of sales history the reorder forecast's velocity
// (units/day) is averaged over — long enough to smooth out day-to-day noise,
// short enough to react to a real recent trend rather than ancient history.
const VELOCITY_WINDOW_DAYS = 30;
// A suggested reorder brings stock back up to roughly this many days of
// runway at the current pace, not just "restock to 0 days left" — an
// in-code constant like the alert thresholds elsewhere in this app
// (ETIMS_BACKLOG_ALERT_THRESHOLD, SHIFT_DISCREPANCY_ALERT_THRESHOLD, etc.).
const REORDER_TARGET_COVERAGE_DAYS = 14;

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
    reportError(req, err, 'Error creating variant');
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
    reportError(req, err, 'Error fetching variants');
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
    reportError(req, err, 'Error updating variant');
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
    reportError(req, err, 'Error deleting variant');
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
    reportError(req, err, 'Error looking up barcode');
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
    reportError(req, err, 'Error fetching low stock variants');
    res.status(500).json({ error: 'Server error fetching low stock variants' });
  }
};

// Sales-velocity-based reorder forecast — a "will sell out in ~N days at
// current pace" signal, complementing (not replacing) the static
// reorderThreshold check above. Only variants with actual recent sales
// momentum are included: a variant sitting at zero stock with zero recent
// sales is already surfaced by getLowStockVariants and isn't "about to run
// out" in any actionable sense here.
exports.getReorderForecast = async (req, res) => {
  try {
    const windowStart = new Date(Date.now() - VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // Net units actually sold per variant in the window — returns subtract
    // out, same convention the dashboard's topProducts/margin report use.
    const salesAgg = await Sale.aggregate([
      { $match: { createdAt: { $gte: windowStart } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.variant',
          unitsSold: { $sum: { $subtract: ['$items.quantity', { $ifNull: ['$items.returnedQuantity', 0] }] } },
        },
      },
    ]);

    const variantIds = salesAgg.map((s) => s._id).filter(Boolean);
    const variants = variantIds.length
      ? await Variant.find({ _id: { $in: variantIds }, active: true }).populate('style', 'name').lean()
      : [];
    const variantById = new Map(variants.map((v) => [v._id.toString(), v]));

    const forecast = salesAgg
      .map((s) => {
        const variant = s._id && variantById.get(s._id.toString());
        // Skips a since-deleted/deactivated variant, or a variant whose net
        // sold in the window is zero-or-negative (e.g. entirely returned) —
        // neither has real "will sell out" momentum to report.
        if (!variant || s.unitsSold <= 0) return null;
        const velocityPerDay = s.unitsSold / VELOCITY_WINDOW_DAYS;
        const daysUntilStockout = parseFloat((variant.stock / velocityPerDay).toFixed(1));
        const suggestedReorderQty = Math.max(0, Math.ceil(velocityPerDay * REORDER_TARGET_COVERAGE_DAYS) - variant.stock);
        return {
          variantId: variant._id,
          name: `${variant.style?.name || 'Unknown'} (${variant.size}/${variant.color})`,
          stock: variant.stock,
          unitsSoldInWindow: s.unitsSold,
          velocityPerDay: parseFloat(velocityPerDay.toFixed(2)),
          daysUntilStockout,
          suggestedReorderQty,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout)
      .slice(0, 100); // defensive cap, same idea as the margin report's byStyle limit

    res.json({ windowDays: VELOCITY_WINDOW_DAYS, targetCoverageDays: REORDER_TARGET_COVERAGE_DAYS, forecast });
  } catch (err) {
    reportError(req, err, 'Error computing reorder forecast');
    res.status(500).json({ error: 'Server error computing reorder forecast' });
  }
};
