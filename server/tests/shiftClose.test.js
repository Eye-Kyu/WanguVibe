const shiftController = require('../controllers/shiftController');
const Shift = require('../models/Shift');
const Sale = require('../models/Sale');
const { makeUser, makeStyleWithVariant, fakeId } = require('./fixtures');

// closeShift is a plain Express handler — call it directly with a minimal
// mock req/res rather than standing up an HTTP server, since none of the
// reconciliation math depends on middleware.
function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

async function makeSaleLine(overrides = {}) {
  const { variant } = await makeStyleWithVariant();
  return { variant: variant._id, styleName: 'Test', size: 'M', color: 'Black', unitPrice: 1000, quantity: 1, ...overrides };
}

describe('closeShift — reconciliation math', () => {
  let cashier;
  beforeEach(async () => {
    cashier = await makeUser();
  });

  test('expectedCash = openingFloat + cash sales, discrepancy = closingCount - expectedCash', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 5000 });
    const line = await makeSaleLine();

    await Sale.create({ items: [line], totalAmount: 1000, paymentMethod: 'cash', payments: [{ method: 'cash', amount: 1000 }], cashier: cashier._id, shift: shift._id });
    await Sale.create({ items: [line], totalAmount: 2000, paymentMethod: 'cash', payments: [{ method: 'cash', amount: 2000 }], cashier: cashier._id, shift: shift._id });
    // A non-cash sale on the same shift must not count toward expected cash.
    await Sale.create({ items: [line], totalAmount: 9000, paymentMethod: 'mpesa', payments: [{ method: 'mpesa', amount: 9000 }], cashier: cashier._id, shift: shift._id });

    const req = { params: { id: shift._id.toString() }, body: { closingCount: 8100 }, user: { id: cashier._id.toString(), role: 'cashier' } };
    const res = mockRes();
    await shiftController.closeShift(req, res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const saved = await Shift.findById(shift._id);
    expect(saved.expectedCash).toBe(8000); // 5000 + 1000 + 2000
    expect(saved.discrepancy).toBe(100); // 8100 - 8000
    expect(saved.status).toBe('closed');
  });

  test('the cash portion of a split-tender sale counts toward expected cash', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 1000 });
    const line = await makeSaleLine();

    // Split sale: 600 cash + 400 card — only the 600 should count as cash.
    await Sale.create({
      items: [line],
      totalAmount: 1000,
      paymentMethod: 'split',
      payments: [{ method: 'cash', amount: 600 }, { method: 'card', amount: 400 }],
      cashier: cashier._id,
      shift: shift._id,
    });

    const req = { params: { id: shift._id.toString() }, body: { closingCount: 1600 }, user: { id: cashier._id.toString(), role: 'cashier' } };
    const res = mockRes();
    await shiftController.closeShift(req, res);

    const saved = await Shift.findById(shift._id);
    expect(saved.expectedCash).toBe(1600); // 1000 opening float + 600 cash leg
    expect(saved.discrepancy).toBe(0);
  });

  test('cash refunds processed during this shift reduce expected cash, regardless of which shift the original sale belongs to', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 5000 });
    const line = await makeSaleLine();

    // Original sale made on some other (earlier, already-closed) shift...
    const otherShift = await Shift.create({ openedBy: cashier._id, openingFloat: 0, status: 'closed', closedAt: new Date(Date.now() - 100000) });
    const originalSale = await Sale.create({
      items: [{ ...line, returnedQuantity: 1 }],
      totalAmount: 3000,
      paymentMethod: 'card',
      payments: [{ method: 'card', amount: 3000 }],
      cashier: cashier._id,
      shift: otherShift._id,
      returns: [{ destination: 'cash', amount: 3000, items: [{ variant: line.variant, quantity: 1 }], processedBy: cashier._id, processedAt: new Date() }],
    });

    const req = { params: { id: shift._id.toString() }, body: { closingCount: 2000 }, user: { id: cashier._id.toString(), role: 'cashier' } };
    const res = mockRes();
    await shiftController.closeShift(req, res);

    const saved = await Shift.findById(shift._id);
    expect(saved.expectedCash).toBe(2000); // 5000 opening float minus the 3000 cash refund
    expect(saved.discrepancy).toBe(0);
    expect(originalSale.shift.toString()).not.toBe(shift._id.toString());
  });

  test('a refund processed before this shift opened is excluded', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 1000 });
    const line = await makeSaleLine();
    const before = new Date(shift.openedAt.getTime() - 60_000);

    await Sale.create({
      items: [{ ...line, returnedQuantity: 1 }],
      totalAmount: 3000,
      paymentMethod: 'card',
      payments: [{ method: 'card', amount: 3000 }],
      cashier: cashier._id,
      returns: [{ destination: 'cash', amount: 3000, items: [{ variant: line.variant, quantity: 1 }], processedBy: cashier._id, processedAt: before }],
    });

    const req = { params: { id: shift._id.toString() }, body: { closingCount: 1000 }, user: { id: cashier._id.toString(), role: 'cashier' } };
    const res = mockRes();
    await shiftController.closeShift(req, res);

    const saved = await Shift.findById(shift._id);
    expect(saved.expectedCash).toBe(1000); // refund excluded — discrepancy-free
    expect(saved.discrepancy).toBe(0);
  });

  test('rejects a non-numeric or negative closingCount', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 0 });
    const res1 = mockRes();
    await shiftController.closeShift({ params: { id: shift._id.toString() }, body: { closingCount: 'lots' }, user: { id: cashier._id.toString(), role: 'cashier' } }, res1);
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = mockRes();
    await shiftController.closeShift({ params: { id: shift._id.toString() }, body: { closingCount: -5 }, user: { id: cashier._id.toString(), role: 'cashier' } }, res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  test('rejects closing a shift that is already closed', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 0, status: 'closed', closedAt: new Date() });
    const res = mockRes();
    await shiftController.closeShift({ params: { id: shift._id.toString() }, body: { closingCount: 0 }, user: { id: cashier._id.toString(), role: 'cashier' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects a cashier closing someone else\'s shift, but allows an admin to', async () => {
    const shift = await Shift.create({ openedBy: cashier._id, openingFloat: 0 });
    const otherCashier = await makeUser({ role: 'cashier' });
    const admin = await makeUser({ role: 'admin' });

    const resDenied = mockRes();
    await shiftController.closeShift({ params: { id: shift._id.toString() }, body: { closingCount: 0 }, user: { id: otherCashier._id.toString(), role: 'cashier' } }, resDenied);
    expect(resDenied.status).toHaveBeenCalledWith(403);

    const resAllowed = mockRes();
    await shiftController.closeShift({ params: { id: shift._id.toString() }, body: { closingCount: 0 }, user: { id: admin._id.toString(), role: 'admin' } }, resAllowed);
    expect(resAllowed.status).not.toHaveBeenCalledWith(403);
    const saved = await Shift.findById(shift._id);
    expect(saved.status).toBe('closed');
  });

  test('404s for a nonexistent shift', async () => {
    const res = mockRes();
    await shiftController.closeShift({ params: { id: fakeId().toString() }, body: { closingCount: 0 }, user: { id: cashier._id.toString(), role: 'cashier' } }, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
