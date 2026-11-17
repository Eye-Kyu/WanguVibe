const Style = require('../models/Style');
const { reportError } = require('../utils/reportError');
const { escapeRegex } = require('../utils/escapeRegex');
const Variant = require('../models/Variant');
const { logAudit } = require('../utils/auditLogger');

// GET all styles, each with its variants embedded.
// Boutique catalogs are small enough (compared to a mini-mart's flat SKU count)
// that returning the whole style+variant tree in one call keeps the POS screen
// a single fetch, same as the old getAllProducts did for flat products.
exports.getAllStyles = async (req, res) => {
  try {
    const { search, category, activeOnly } = req.query;
    const safeSearch = search ? escapeRegex(search) : '';
    const query = {};
    if (activeOnly !== 'false') query.active = true;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: { $regex: safeSearch, $options: 'i' } },
        { styleCode: { $regex: safeSearch, $options: 'i' } },
        { brand: { $regex: safeSearch, $options: 'i' } },
      ];
    }

    const styles = await Style.find(query).sort({ name: 1 }).lean();
    const styleIds = styles.map(s => s._id);
    const variants = await Variant.find({ style: { $in: styleIds } }).lean();

    const variantsByStyle = variants.reduce((acc, v) => {
      const key = v.style.toString();
      (acc[key] = acc[key] || []).push(v);
      return acc;
    }, {});

    const result = styles.map(s => ({ ...s, variants: variantsByStyle[s._id.toString()] || [] }));
    res.json(result);
  } catch (err) {
    reportError(req, err, 'Error fetching styles');
    res.status(500).json({ error: 'Server error fetching styles' });
  }
};

exports.getStyleById = async (req, res) => {
  try {
    const style = await Style.findById(req.params.id).lean();
    if (!style) return res.status(404).json({ error: 'Style not found' });
    const variants = await Variant.find({ style: style._id }).lean();
    res.json({ ...style, variants });
  } catch (err) {
    reportError(req, err, 'Error fetching style');
    res.status(500).json({ error: 'Server error fetching style' });
  }
};

// Create a style. Optionally accepts an initial `variants` array (JSON string,
// since this is a multipart request when an image is attached) so a new style
// can be created with its full size/color matrix in one call from the admin UI.
exports.createStyle = async (req, res) => {
  try {
    const { name, styleCode, brand, description, category, season, material, basePrice, costPrice, variants } = req.body;
    const imageUrl = req.file?.path || '';

    const style = new Style({
      name,
      styleCode: styleCode?.trim() || undefined,
      brand,
      description,
      category,
      season,
      material,
      basePrice,
      costPrice: costPrice || 0,
      images: imageUrl ? [imageUrl] : [],
    });
    await style.save();

    let createdVariants = [];
    if (variants) {
      const parsed = typeof variants === 'string' ? JSON.parse(variants) : variants;
      if (Array.isArray(parsed) && parsed.length > 0) {
        createdVariants = await Variant.insertMany(
          parsed.map(v => ({
            style: style._id,
            size: v.size,
            color: v.color,
            sku: v.sku,
            barcode: v.barcode?.trim() || undefined,
            stock: v.stock || 0,
            priceOverride: v.priceOverride ?? null,
            reorderThreshold: v.reorderThreshold ?? 2,
          }))
        );
      }
    }

    logAudit({ action: 'style_created', details: { styleId: style._id, name: style.name }, userId: req.user.id });
    res.status(201).json({ ...style.toObject(), variants: createdVariants });
  } catch (err) {
    reportError(req, err, 'Error creating style');
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A style or variant with that code/SKU/barcode already exists' });
    }
    res.status(400).json({ error: 'Invalid style data' });
  }
};

exports.updateStyle = async (req, res) => {
  try {
    const { name, styleCode, brand, description, category, season, material, basePrice, costPrice, active } = req.body;
    const setFields = { name, brand, description, category, season, material, basePrice, costPrice, active };
    if (req.file?.path) setFields.images = [req.file.path];
    if (styleCode && styleCode.trim()) setFields.styleCode = styleCode.trim();

    const updated = await Style.findByIdAndUpdate(req.params.id, { $set: setFields }, { new: true });
    if (!updated) return res.status(404).json({ error: 'Style not found' });
    logAudit({ action: 'style_updated', details: { styleId: updated._id, changes: setFields }, userId: req.user.id });
    res.json(updated);
  } catch (err) {
    reportError(req, err, 'Error updating style');
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A style with this style code already exists' });
    }
    res.status(400).json({ error: 'Invalid update data' });
  }
};

// Deleting a style cascades to its variants — a variant can't meaningfully
// exist without its parent style. Past sales keep their denormalized
// styleName/size/color, so historical receipts/reports are unaffected.
exports.deleteStyle = async (req, res) => {
  try {
    const deleted = await Style.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Style not found' });
    await Variant.deleteMany({ style: req.params.id });
    logAudit({ action: 'style_deleted', details: { styleId: deleted._id, name: deleted.name }, userId: req.user.id });
    res.json({ message: 'Style and its variants deleted' });
  } catch (err) {
    reportError(req, err, 'Error deleting style');
    res.status(400).json({ error: 'Error deleting style' });
  }
};
