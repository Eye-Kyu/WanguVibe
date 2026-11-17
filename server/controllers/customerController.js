const Customer = require('../models/Customer');
const { reportError } = require('../utils/reportError');
const { escapeRegex } = require('../utils/escapeRegex');
const StoreCreditLedger = require('../models/StoreCreditLedger');

exports.getAllCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    const safeSearch = search ? escapeRegex(search) : '';
    const query = search
      ? { $or: [{ name: { $regex: safeSearch, $options: 'i' } }, { phone: { $regex: safeSearch, $options: 'i' } }, { email: { $regex: safeSearch, $options: 'i' } }] }
      : {};
    const customers = await Customer.find(query).sort({ name: 1 });
    res.json(customers);
  } catch (err) {
    reportError(req, err, 'Error fetching customers');
    res.status(500).json({ error: 'Server error fetching customers' });
  }
};

exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    reportError(req, err, 'Error fetching customer');
    res.status(500).json({ error: 'Server error fetching customer' });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    const customer = new Customer({
      name,
      phone: phone?.trim() || undefined,
      email: email?.trim() || undefined,
      notes,
    });
    await customer.save();
    res.status(201).json(customer);
  } catch (err) {
    reportError(req, err, 'Error creating customer');
    if (err.code === 11000) {
      return res.status(400).json({ error: 'A customer with this phone or email already exists' });
    }
    res.status(400).json({ error: 'Invalid customer data' });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { name, phone, email, notes } = req.body;
    const updated = await Customer.findByIdAndUpdate(
      req.params.id,
      { $set: { name, phone, email, notes } },
      { new: true }
    );
    if (!updated) return res.status(404).json({ error: 'Customer not found' });
    res.json(updated);
  } catch (err) {
    reportError(req, err, 'Error updating customer');
    res.status(400).json({ error: 'Invalid update data' });
  }
};

// GET /api/customers/:id/store-credit-ledger — the customer's full store
// credit history (small enough per-customer that pagination isn't warranted,
// unlike audit logs/shifts which are unbounded across the whole system).
exports.getStoreCreditLedger = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id, 'name storeCreditBalance');
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const entries = await StoreCreditLedger.find({ customer: req.params.id })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'name')
      .lean();

    res.json({ balance: customer.storeCreditBalance, entries });
  } catch (err) {
    reportError(req, err, 'Error fetching store credit ledger');
    res.status(500).json({ error: 'Server error fetching store credit ledger' });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const deleted = await Customer.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    reportError(req, err, 'Error deleting customer');
    res.status(400).json({ error: 'Error deleting customer' });
  }
};
