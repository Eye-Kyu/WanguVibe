// One-off migration: populates the new Sale.payments[] array (added for
// split-tender support) on sales created before that field existed, from
// each sale's existing flat paymentMethod/customer/giftCardRedeemed fields.
// Without this, older sales would silently drop out of the shift cash
// reconciliation and dashboard payment-breakdown aggregations, which now
// read payments[] instead of the flat paymentMethod field.
//   node scripts/backfillSalePayments.js
require('dotenv').config();
const mongoose = require('mongoose');
const Sale = require('../models/Sale');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const sales = await Sale.find({ payments: { $exists: false } });
  console.log(`Found ${sales.length} sale(s) missing payments[].`);

  let updated = 0;
  for (const sale of sales) {
    const line = { method: sale.paymentMethod, amount: sale.totalAmount, customer: null, giftCardCode: null };
    if (sale.paymentMethod === 'store_credit') line.customer = sale.customer;
    if (sale.paymentMethod === 'gift_card') line.giftCardCode = sale.giftCardRedeemed?.code || null;

    sale.payments = [line];
    await sale.save();
    updated++;
  }

  console.log(`Backfilled ${updated} sale(s).`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
