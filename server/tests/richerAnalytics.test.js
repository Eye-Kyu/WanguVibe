const { getCustomerValue, getStaffPerformance, getCohortRetention } = require('../routes/dashboard');
const Sale = require('../models/Sale');
const { makeStyleWithVariant, makeCustomer, makeUser } = require('./fixtures');

// Plain Express handlers — call directly with a minimal mock req/res, same
// convention this app's controllers already use (see shiftClose.test.js).
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function makeSale({ customer, cashier, amount, daysAgo = 0 }) {
  const { variant } = await makeStyleWithVariant();
  const sale = await Sale.create({
    items: [{ variant: variant._id, styleName: 'Test', size: variant.size, color: variant.color, unitPrice: amount, quantity: 1 }],
    totalAmount: amount,
    paymentMethod: 'cash',
    payments: [{ method: 'cash', amount }],
    cashier: cashier._id,
    customer: customer ? customer._id : null,
  });
  if (daysAgo > 0) {
    await Sale.collection.updateOne({ _id: sale._id }, { $set: { createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000) } });
  }
  return sale;
}

describe('GET /dashboard/customer-value', () => {
  test('nets refunds and computes order count / avgOrderValue correctly', async () => {
    const cashier = await makeUser();
    const customer = await makeCustomer();
    const sale1 = await makeSale({ customer, cashier, amount: 1000 });
    await makeSale({ customer, cashier, amount: 500 });
    await Sale.findByIdAndUpdate(sale1._id, { refundedAmount: 200 }); // net 800

    const req = {};
    const res = mockRes();
    await getCustomerValue(req, res);
    const body = res.json.mock.calls[0][0];

    const row = body.customers.find((c) => c.customerId.toString() === customer._id.toString());
    expect(row.totalSpend).toBe(1300); // (1000-200) + 500
    expect(row.orderCount).toBe(2);
    expect(row.avgOrderValue).toBe(650);
  });

  test('excludes sales with no customer attached', async () => {
    const cashier = await makeUser();
    await makeSale({ customer: null, cashier, amount: 5000 });

    const req = {};
    const res = mockRes();
    await getCustomerValue(req, res);
    const body = res.json.mock.calls[0][0];

    const total = body.customers.reduce((s, c) => s + c.totalSpend, 0);
    expect(total).toBe(0);
  });
});

describe('GET /dashboard/staff-performance', () => {
  test('groups revenue/transactions by cashier within the requested range', async () => {
    const cashierA = await makeUser({ name: 'Cashier A' });
    const cashierB = await makeUser({ name: 'Cashier B' });
    await makeSale({ cashier: cashierA, amount: 1000 });
    await makeSale({ cashier: cashierA, amount: 500 });
    await makeSale({ cashier: cashierB, amount: 2000 });

    const req = { query: { range: 'day' } };
    const res = mockRes();
    await getStaffPerformance(req, res);
    const body = res.json.mock.calls[0][0];

    const rowA = body.staff.find((s) => s.cashierId.toString() === cashierA._id.toString());
    const rowB = body.staff.find((s) => s.cashierId.toString() === cashierB._id.toString());
    expect(rowA).toMatchObject({ name: 'Cashier A', revenue: 1500, transactionCount: 2, avgSaleValue: 750 });
    expect(rowB).toMatchObject({ name: 'Cashier B', revenue: 2000, transactionCount: 1, avgSaleValue: 2000 });
  });

  test('excludes a sale outside the requested range', async () => {
    const cashier = await makeUser();
    await makeSale({ cashier, amount: 1000, daysAgo: 40 });

    const req = { query: { range: 'day' } };
    const res = mockRes();
    await getStaffPerformance(req, res);
    const body = res.json.mock.calls[0][0];

    const row = body.staff.find((s) => s.cashierId.toString() === cashier._id.toString());
    expect(row).toBeUndefined();
  });
});

describe('GET /dashboard/cohorts', () => {
  test('assigns a customer\'s earliest purchase month as their cohort, and monthOffset 0 always equals cohortSize', async () => {
    const cashier = await makeUser();
    const customer = await makeCustomer();
    await makeSale({ customer, cashier, amount: 500, daysAgo: 0 }); // this month

    const req = {};
    const res = mockRes();
    await getCohortRetention(req, res);
    const body = res.json.mock.calls[0][0];

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cohort = body.cohorts.find((c) => c.cohortMonth === thisMonth);
    expect(cohort).toBeTruthy();
    const offset0 = cohort.retention.find((r) => r.monthOffset === 0);
    expect(offset0.customersReturned).toBe(cohort.cohortSize);
    expect(offset0.retentionPct).toBe(100);
  });

  test('a repeat purchase ~1 calendar month later counts toward monthOffset 1', async () => {
    const cashier = await makeUser();
    const customer = await makeCustomer();
    // First purchase 40 days ago, second purchase 5 days ago — spans (at
    // least) one calendar-month boundary in every real-world case, so the
    // second purchase's month differs from the first's.
    await makeSale({ customer, cashier, amount: 500, daysAgo: 40 });
    await makeSale({ customer, cashier, amount: 500, daysAgo: 5 });

    const req = {};
    const res = mockRes();
    await getCohortRetention(req, res);
    const body = res.json.mock.calls[0][0];

    const cohortWithCustomer = body.cohorts.find((c) => c.retention.some((r) => r.monthOffset > 0 && r.customersReturned > 0));
    expect(cohortWithCustomer).toBeTruthy();
    const laterOffset = cohortWithCustomer.retention.find((r) => r.monthOffset > 0);
    expect(laterOffset.customersReturned).toBeGreaterThanOrEqual(1);
  });

  test('a customer who never returns only contributes to monthOffset 0', async () => {
    const cashier = await makeUser();
    const customer = await makeCustomer();
    await makeSale({ customer, cashier, amount: 500 });

    const req = {};
    const res = mockRes();
    await getCohortRetention(req, res);
    const body = res.json.mock.calls[0][0];

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const cohort = body.cohorts.find((c) => c.cohortMonth === thisMonth);
    expect(cohort.retention).toHaveLength(1);
    expect(cohort.retention[0].monthOffset).toBe(0);
  });

  test('excludes sales with no customer attached', async () => {
    const cashier = await makeUser();
    await makeSale({ customer: null, cashier, amount: 500 });

    const req = {};
    const res = mockRes();
    await getCohortRetention(req, res);
    const body = res.json.mock.calls[0][0];

    const totalCustomersAcrossCohorts = body.cohorts.reduce((s, c) => s + c.cohortSize, 0);
    expect(totalCustomersAcrossCohorts).toBe(0);
  });
});
