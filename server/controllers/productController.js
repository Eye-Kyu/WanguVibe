const Product = require('../models/Product');

exports.getAllProducts = async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? { $or: [{ name: { $regex: search, $options: 'i' } }, { barcode: { $regex: search, $options: 'i' } }] }
      : {};
    const products = await Product.find(query).select('name price stock barcode image category');
    res.json(products);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Server error fetching products' });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const { name, barcode, price, stock, category } = req.body;
    const imageUrl = req.file?.path || '';

    const product = new Product({
      name,
      barcode: barcode?.trim() || undefined, // sparse index — never store empty string
      price,
      stock,
      category,
      image: imageUrl,
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    console.error('Error creating product:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A product with this barcode already exists' });
    }
    res.status(400).json({ error: 'Invalid product data' });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { name, barcode, price, stock, category } = req.body;

    const setFields = { name, price, stock, category };
    if (req.file?.path) setFields.image = req.file.path;

    let updateOp;
    if (barcode && barcode.trim()) {
      setFields.barcode = barcode.trim();
      updateOp = { $set: setFields };
    } else if (barcode === '') {
      // Explicit clear — remove barcode from document
      updateOp = { $set: setFields, $unset: { barcode: 1 } };
    } else {
      // barcode not submitted — leave existing value untouched
      updateOp = { $set: setFields };
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateOp, { new: true });
    if (!updated) return res.status(404).json({ error: 'Product not found' });
    res.json(updated);
  } catch (err) {
    console.error('Error updating product:', err);
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A product with this barcode already exists' });
    }
    res.status(400).json({ error: 'Invalid update data' });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(400).json({ error: 'Error deleting product' });
  }
};

exports.getLowStockProducts = async (req, res) => {
  try {
    const lowStock = await Product.find({ stock: { $lt: 10 } });
    res.json(lowStock);
  } catch (err) {
    console.error('Error fetching low stock products:', err);
    res.status(500).json({ error: 'Server error fetching low stock products' });
  }
};
