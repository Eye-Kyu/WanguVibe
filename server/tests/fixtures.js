const mongoose = require('mongoose');
const Style = require('../models/Style');
const Variant = require('../models/Variant');
const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const User = require('../models/User');

let counter = 0;
const uniq = () => `${Date.now()}-${counter++}`;

async function makeStyle(overrides = {}) {
  return Style.create({
    name: 'Test Style',
    basePrice: 1000,
    costPrice: 400,
    category: 'Tops',
    ...overrides,
  });
}

async function makeVariant(style, overrides = {}) {
  const id = uniq();
  return Variant.create({
    style: style._id,
    size: 'M',
    color: 'Black',
    sku: `SKU-${id}`,
    barcode: `BC-${id}`,
    stock: 10,
    ...overrides,
  });
}

// Convenience: a Style + one Variant in one call, for tests that don't care
// about the Style fields.
async function makeStyleWithVariant(styleOverrides = {}, variantOverrides = {}) {
  const style = await makeStyle(styleOverrides);
  const variant = await makeVariant(style, variantOverrides);
  return { style, variant };
}

async function makeCustomer(overrides = {}) {
  return Customer.create({
    name: 'Test Customer',
    phone: `07${Math.floor(10000000 + Math.random() * 89999999)}`,
    storeCreditBalance: 0,
    ...overrides,
  });
}

async function makeGiftCard(overrides = {}) {
  const balance = overrides.currentBalance ?? overrides.initialBalance ?? 1000;
  return GiftCard.create({
    code: `GC-TEST${uniq()}`,
    initialBalance: balance,
    currentBalance: balance,
    status: 'active',
    ...overrides,
  });
}

async function makeUser(overrides = {}) {
  return User.create({
    name: 'Test User',
    username: `user-${uniq()}`,
    password: 'hashed-not-used-in-tests',
    role: 'cashier',
    ...overrides,
  });
}

const fakeId = () => new mongoose.Types.ObjectId();

module.exports = { makeStyle, makeVariant, makeStyleWithVariant, makeCustomer, makeGiftCard, makeUser, fakeId };
