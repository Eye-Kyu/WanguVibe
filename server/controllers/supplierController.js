const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const { reportError } = require('../utils/reportError');

exports.getAllSuppliers = async (req, res) => {
  try {
    const { search } = req.query;
    const query = search
      ? { $or: [{ name: { $regex: search, $options: 'i' } }, { contactName: { $regex: search, $options: 'i' } }, { phone: { $regex: search, $options: 'i' } }] }
      : {};
    const suppliers = await Supplier.find(query).sort({ name: 1 });
    res.json(suppliers);
  } catch (err) {
    reportError(req, err, 'Error fetching suppliers');
    res.status(500).json({ error: 'Server error fetching suppliers' });
  }
};

exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    reportError(req, err, 'Error fetching supplier');
    res.status(500).json({ error: 'Server error fetching supplier' });
  }
};

exports.createSupplier = async (req, res) => {
  try {
    const { name, contactName, phone, email, address, notes } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Supplier name is required' });
    const supplier = new Supplier({ name: name.trim(), contactName, phone, email, address, notes });
    await supplier.save();
    res.status(201).json(supplier);
  } catch (err) {
    reportError(req, err, 'Error creating supplier');
    res.status(400).json({ error: 'Invalid supplier data' });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const { name, contactName, phone, email, address, notes, active } = req.body;
    const updated = await Supplier.findByIdAndUpdate(
      req.params.id,
      { $set: { name, contactName, phone, email, address, notes, active } },
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ error: 'Supplier not found' });
    res.json(updated);
  } catch (err) {
    reportError(req, err, 'Error updating supplier');
    res.status(400).json({ error: 'Invalid update data' });
  }
};

// A supplier with any non-cancelled PO on file is kept for referential
// integrity — deleting it would orphan real purchase history.
exports.deleteSupplier = async (req, res) => {
  try {
    const activePoCount = await PurchaseOrder.countDocuments({ supplier: req.params.id, status: { $ne: 'cancelled' } });
    if (activePoCount > 0) {
      return res.status(400).json({ error: `Cannot delete — this supplier has ${activePoCount} active purchase order(s)` });
    }
    const deleted = await Supplier.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ message: 'Supplier deleted' });
  } catch (err) {
    reportError(req, err, 'Error deleting supplier');
    res.status(400).json({ error: 'Error deleting supplier' });
  }
};
