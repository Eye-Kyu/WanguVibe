const { broadcastStockChanges, refetchAndBroadcast, addClient, removeClient } = require('../services/stockBroadcast');
const { makeStyleWithVariant } = require('./fixtures');

function mockSseClient() {
  return { write: jest.fn() };
}

describe('broadcastStockChanges', () => {
  test('writes an SSE data frame to every registered client', () => {
    const client1 = mockSseClient();
    const client2 = mockSseClient();
    addClient(client1);
    addClient(client2);
    try {
      broadcastStockChanges([{ variantId: 'v1', styleId: 's1', stock: 5 }]);
      for (const client of [client1, client2]) {
        expect(client.write).toHaveBeenCalledTimes(1);
        const frame = client.write.mock.calls[0][0];
        expect(frame).toMatch(/^data: /);
        const parsed = JSON.parse(frame.replace(/^data: /, '').trim());
        expect(parsed).toEqual({ type: 'stock_update', changes: [{ variantId: 'v1', styleId: 's1', stock: 5 }] });
      }
    } finally {
      removeClient(client1);
      removeClient(client2);
    }
  });

  test('a removed client receives nothing further', () => {
    const client = mockSseClient();
    addClient(client);
    removeClient(client);
    broadcastStockChanges([{ variantId: 'v1', styleId: 's1', stock: 5 }]);
    expect(client.write).not.toHaveBeenCalled();
  });

  test('an empty/missing changes array is a no-op', () => {
    const client = mockSseClient();
    addClient(client);
    try {
      broadcastStockChanges([]);
      broadcastStockChanges(null);
      expect(client.write).not.toHaveBeenCalled();
    } finally {
      removeClient(client);
    }
  });
});

describe('refetchAndBroadcast', () => {
  test('broadcasts the true current DB value, not a value the caller supplies', async () => {
    // This is the actual correctness invariant refetchAndBroadcast exists
    // for: every stock-changing call site could compute "old - quantity"
    // locally, but that's wrong under concurrent writes to the same variant.
    // Prove the function ignores any such assumption by mutating the
    // variant's real stock *after* the "transaction" that supposedly changed
    // it, then confirming the broadcast reflects the newer value.
    const { variant } = await makeStyleWithVariant({}, { stock: 20 });
    const Variant = require('../models/Variant');
    // Simulate a second, later write winning the race before the broadcast fires.
    await Variant.findByIdAndUpdate(variant._id, { stock: 7 });

    const client = mockSseClient();
    addClient(client);
    try {
      await refetchAndBroadcast([variant._id]);
      expect(client.write).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(client.write.mock.calls[0][0].replace(/^data: /, '').trim());
      expect(parsed.changes[0].stock).toBe(7); // the real current value, not whatever the caller assumed
      expect(parsed.changes[0].variantId).toBe(variant._id.toString());
      expect(parsed.changes[0].styleId).toBe(variant.style.toString());
    } finally {
      removeClient(client);
    }
  });

  test('a missing/empty variantIds array is a no-op (no query, no broadcast)', async () => {
    const client = mockSseClient();
    addClient(client);
    try {
      await refetchAndBroadcast([]);
      await refetchAndBroadcast(null);
      expect(client.write).not.toHaveBeenCalled();
    } finally {
      removeClient(client);
    }
  });

  test('batches multiple variants into a single broadcast frame', async () => {
    const { variant: v1 } = await makeStyleWithVariant({}, { stock: 3 });
    const { variant: v2 } = await makeStyleWithVariant({}, { stock: 9 });

    const client = mockSseClient();
    addClient(client);
    try {
      await refetchAndBroadcast([v1._id, v2._id]);
      expect(client.write).toHaveBeenCalledTimes(1);
      const parsed = JSON.parse(client.write.mock.calls[0][0].replace(/^data: /, '').trim());
      expect(parsed.changes).toHaveLength(2);
      const stocks = parsed.changes.map((c) => c.stock).sort();
      expect(stocks).toEqual([3, 9]);
    } finally {
      removeClient(client);
    }
  });
});
