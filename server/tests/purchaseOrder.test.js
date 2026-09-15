const supplierController = require('../controllers/supplierController');
const purchaseOrderController = require('../controllers/purchaseOrderController');
const Supplier = require('../models/Supplier');
const PurchaseOrder = require('../models/PurchaseOrder');
const Variant = require('../models/Variant');
const InventoryLog = require('../models/InventoryLog');
const { makeStyleWithVariant, makeUser, fakeId } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(overrides = {}) {
  return { params: {}, body: {}, query: {}, user: {}, ...overrides };
}

describe('Supplier CRUD', () => {
  test('creates a supplier, rejecting a missing name', async () => {
    const res1 = mockRes();
    await supplierController.createSupplier(mockReq({ body: { name: 'Acme Textiles', phone: '0700000000' } }), res1);
    expect(res1.status).toHaveBeenCalledWith(201);

    const res2 = mockRes();
    await supplierController.createSupplier(mockReq({ body: { phone: '0700000000' } }), res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  test('updates a supplier', async () => {
    const createRes = mockRes();
    await supplierController.createSupplier(mockReq({ body: { name: 'Acme Textiles' } }), createRes);
    const supplier = createRes.json.mock.calls[0][0];

    const res = mockRes();
    await supplierController.updateSupplier(mockReq({ params: { id: supplier._id }, body: { name: 'Acme Textiles Ltd' } }), res);
    expect(res.json.mock.calls[0][0].name).toBe('Acme Textiles Ltd');
  });

  test('blocks deletion while an active purchase order references the supplier, allows it once cancelled', async () => {
    const supplier = await Supplier.create({ name: 'Blocked Supplier' });
    const cashier = await makeUser();
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });

    const createRes = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [{ variant: variant._id, quantityOrdered: 5, unitCost: 400 }] },
    }), createRes);
    const po = createRes.json.mock.calls[0][0];

    const deleteRes1 = mockRes();
    await supplierController.deleteSupplier(mockReq({ params: { id: supplier._id.toString() } }), deleteRes1);
    expect(deleteRes1.status).toHaveBeenCalledWith(400);

    await purchaseOrderController.cancelPurchaseOrder(mockReq({ params: { id: po._id }, user: { id: cashier._id.toString() } }), mockRes());

    const deleteRes2 = mockRes();
    await supplierController.deleteSupplier(mockReq({ params: { id: supplier._id.toString() } }), deleteRes2);
    expect(deleteRes2.status).not.toHaveBeenCalledWith(400);
  });
});

describe('createPurchaseOrder', () => {
  let cashier, supplier;
  beforeEach(async () => {
    cashier = await makeUser();
    supplier = await Supplier.create({ name: 'Test Supplier' });
  });

  test('creates a PO with denormalized item fields and status=ordered', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const res = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [{ variant: variant._id, quantityOrdered: 10, unitCost: 450 }] },
    }), res);

    expect(res.status).toHaveBeenCalledWith(201);
    const po = res.json.mock.calls[0][0];
    expect(po.status).toBe('ordered');
    expect(po.items).toHaveLength(1);
    expect(po.items[0].quantityOrdered).toBe(10);
    expect(po.items[0].quantityReceived).toBe(0);
    expect(po.items[0].styleName).toBeTruthy();
  });

  test('rejects a missing supplier', async () => {
    const { variant } = await makeStyleWithVariant();
    const res = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { items: [{ variant: variant._id, quantityOrdered: 1, unitCost: 1 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects empty items', async () => {
    const res = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects a zero quantity or negative unit cost', async () => {
    const { variant } = await makeStyleWithVariant();
    const res1 = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [{ variant: variant._id, quantityOrdered: 0, unitCost: 100 }] },
    }), res1);
    expect(res1.status).toHaveBeenCalledWith(400);

    const res2 = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [{ variant: variant._id, quantityOrdered: 5, unitCost: -1 }] },
    }), res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });

  test('rejects a nonexistent variant', async () => {
    const res = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [{ variant: fakeId(), quantityOrdered: 1, unitCost: 1 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('receivePurchaseOrder', () => {
  let cashier, supplier, variant, poId;

  beforeEach(async () => {
    cashier = await makeUser();
    supplier = await Supplier.create({ name: 'Test Supplier' });
    const styleAndVariant = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    variant = styleAndVariant.variant;

    const createRes = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [{ variant: variant._id, quantityOrdered: 10, unitCost: 450 }] },
    }), createRes);
    poId = createRes.json.mock.calls[0][0]._id;
  });

  test('a partial receipt increments stock, quantityReceived, and status=partially_received', async () => {
    const res = mockRes();
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId },
      user: { id: cashier._id.toString() },
      body: { items: [{ variant: variant._id.toString(), quantity: 4 }] },
    }), res);

    expect(res.status).not.toHaveBeenCalledWith(400);
    const po = res.json.mock.calls[0][0];
    expect(po.status).toBe('partially_received');
    expect(po.items[0].quantityReceived).toBe(4);

    const updatedVariant = await Variant.findById(variant._id);
    expect(updatedVariant.stock).toBe(9); // 5 + 4

    const log = await InventoryLog.findOne({ variant: variant._id, action: 'purchase_order' });
    expect(log).toBeTruthy();
    expect(log.quantity).toBe(4);
    expect(log.relatedPurchaseOrder.toString()).toBe(poId.toString());
  });

  test('receiving the remaining balance across two calls flips status to received', async () => {
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 6 }] },
    }), mockRes());

    const res = mockRes();
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 4 }] },
    }), res);

    const po = res.json.mock.calls[0][0];
    expect(po.status).toBe('received');
    expect(po.items[0].quantityReceived).toBe(10);

    const updatedVariant = await Variant.findById(variant._id);
    expect(updatedVariant.stock).toBe(15); // 5 + 6 + 4
  });

  test('rejects receiving more than the outstanding quantity', async () => {
    const res = mockRes();
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 999 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);

    const updatedVariant = await Variant.findById(variant._id);
    expect(updatedVariant.stock).toBe(5); // unchanged
  });

  test('rejects receiving against an already-fully-received PO', async () => {
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 10 }] },
    }), mockRes());

    const res = mockRes();
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 1 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects receiving against a cancelled PO', async () => {
    await purchaseOrderController.cancelPurchaseOrder(mockReq({ params: { id: poId }, user: { id: cashier._id.toString() } }), mockRes());

    const res = mockRes();
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 1 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects a variant not on the purchase order', async () => {
    const { variant: otherVariant } = await makeStyleWithVariant();
    const res = mockRes();
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: otherVariant._id.toString(), quantity: 1 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('404s for a nonexistent purchase order', async () => {
    const res = mockRes();
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: fakeId().toString() }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 1 }] },
    }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('cancelPurchaseOrder', () => {
  let cashier, supplier, variant, poId;

  beforeEach(async () => {
    cashier = await makeUser();
    supplier = await Supplier.create({ name: 'Test Supplier' });
    const styleAndVariant = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    variant = styleAndVariant.variant;

    const createRes = mockRes();
    await purchaseOrderController.createPurchaseOrder(mockReq({
      user: { id: cashier._id.toString() },
      body: { supplier: supplier._id.toString(), items: [{ variant: variant._id, quantityOrdered: 10, unitCost: 450 }] },
    }), createRes);
    poId = createRes.json.mock.calls[0][0]._id;
  });

  test('cancels from ordered', async () => {
    const res = mockRes();
    await purchaseOrderController.cancelPurchaseOrder(mockReq({ params: { id: poId }, user: { id: cashier._id.toString() } }), res);
    expect(res.json.mock.calls[0][0].status).toBe('cancelled');
  });

  test('cancels from partially_received without reversing stock already received', async () => {
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 3 }] },
    }), mockRes());

    const res = mockRes();
    await purchaseOrderController.cancelPurchaseOrder(mockReq({ params: { id: poId }, user: { id: cashier._id.toString() } }), res);
    expect(res.json.mock.calls[0][0].status).toBe('cancelled');

    const updatedVariant = await Variant.findById(variant._id);
    expect(updatedVariant.stock).toBe(8); // 5 + 3, not reversed
  });

  test('rejects cancelling an already-received PO', async () => {
    await purchaseOrderController.receivePurchaseOrder(mockReq({
      params: { id: poId }, user: { id: cashier._id.toString() }, body: { items: [{ variant: variant._id.toString(), quantity: 10 }] },
    }), mockRes());

    const res = mockRes();
    await purchaseOrderController.cancelPurchaseOrder(mockReq({ params: { id: poId }, user: { id: cashier._id.toString() } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects cancelling an already-cancelled PO', async () => {
    await purchaseOrderController.cancelPurchaseOrder(mockReq({ params: { id: poId }, user: { id: cashier._id.toString() } }), mockRes());
    const res = mockRes();
    await purchaseOrderController.cancelPurchaseOrder(mockReq({ params: { id: poId }, user: { id: cashier._id.toString() } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
