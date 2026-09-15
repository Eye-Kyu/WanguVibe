const { finalizeSale } = require('../controllers/salesController');
const Variant = require('../models/Variant');
const Customer = require('../models/Customer');
const GiftCard = require('../models/GiftCard');
const StoreCreditLedger = require('../models/StoreCreditLedger');
const EtimsRetryQueue = require('../models/EtimsRetryQueue');
const HttpError = require('../utils/httpError');
const { makeStyleWithVariant, makeCustomer, makeGiftCard, makeUser, fakeId } = require('./fixtures');

describe('finalizeSale — validation branches', () => {
  let cashier;
  beforeEach(async () => {
    cashier = (await makeUser()).id;
  });

  test('rejects empty items', async () => {
    await expect(finalizeSale({ items: [], totalAmount: 100, paymentMethod: 'cash', cashier }))
      .rejects.toThrow(HttpError);
  });

  test('rejects zero/negative total', async () => {
    const { variant } = await makeStyleWithVariant();
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 0,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow('Invalid total amount');
  });

  test('rejects an unrecognized payment method', async () => {
    const { variant } = await makeStyleWithVariant();
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'bitcoin',
      cashier,
    })).rejects.toThrow(/Invalid payment method/);
  });

  test('normalizes a human-friendly payment method label ("Store Credit")', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const customer = await makeCustomer({ storeCreditBalance: 2000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'Store Credit',
      customer: customer._id,
      cashier,
    });
    expect(sale.paymentMethod).toBe('store_credit');
  });

  test('rejects cart discount outside 0-100', async () => {
    const { variant } = await makeStyleWithVariant();
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      cartDiscount: 150,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Cart discount/);
  });

  test('rejects when no cashier is supplied', async () => {
    const { variant } = await makeStyleWithVariant();
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'cash',
    })).rejects.toThrow('User authentication required');
  });

  test('rejects store_credit payment with no customer selected', async () => {
    const { variant } = await makeStyleWithVariant();
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'store_credit',
      cashier,
    })).rejects.toThrow(/customer must be selected/);
  });

  test('rejects gift_card payment with no code supplied', async () => {
    const { variant } = await makeStyleWithVariant();
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'gift_card',
      cashier,
    })).rejects.toThrow(/gift card code is required/);
  });

  test('rejects insufficient stock and does not decrement it', async () => {
    const { variant } = await makeStyleWithVariant({}, { stock: 2 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 5, discount: 0 }],
      totalAmount: 5000,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Insufficient stock/);
    const unchanged = await Variant.findById(variant._id);
    expect(unchanged.stock).toBe(2);
  });

  test('rejects a per-line discount outside 0-100', async () => {
    const { variant } = await makeStyleWithVariant();
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 200 }],
      totalAmount: 1000,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/Discount for/);
  });

  test('rejects when totalAmount does not match the calculated total', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 50,
      paymentMethod: 'cash',
      cashier,
    })).rejects.toThrow(/does not match calculated total/);
  });

  test('rejects a zero/negative gift-card-sold amount', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'cash',
      giftCardsSold: [{ amount: 0 }],
      cashier,
    })).rejects.toThrow(/Gift card amount must be greater than 0/);
  });
});

describe('finalizeSale — happy path (cash)', () => {
  let cashier;
  beforeEach(async () => {
    cashier = (await makeUser()).id;
  });

  test('decrements stock, saves the sale, and submits to eTIMS (mock, accepted)', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 2, discount: 0 }],
      totalAmount: 2000,
      paymentMethod: 'cash',
      cashier,
    });

    expect(sale.totalAmount).toBe(2000);
    expect(sale.items).toHaveLength(1);
    expect(sale.items[0].quantity).toBe(2);

    const updatedVariant = await Variant.findById(variant._id);
    expect(updatedVariant.stock).toBe(8);

    expect(sale.etimsStatus).toBe('accepted');
    expect(sale.etimsInvoiceNumber).toBeTruthy();
  });

  test('applies a cart-level discount to the calculated total', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 800,
      cartDiscount: 20,
      paymentMethod: 'cash',
      cashier,
    });
    expect(sale.totalAmount).toBe(800);
  });

  test('queues an EtimsRetryQueue entry and marks the sale unreachable when eTIMS fails, without blocking the sale', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'cash',
      cashier,
      simulateEtimsFailure: true,
    });

    expect(sale.etimsStatus).toBe('unreachable');
    const queued = await EtimsRetryQueue.findOne({ sale: sale._id });
    expect(queued).toBeTruthy();
    expect(queued.status).toBe('pending');
  });
});

describe('finalizeSale — store credit payment (atomic guard)', () => {
  let cashier;
  beforeEach(async () => {
    cashier = (await makeUser()).id;
  });

  test('debits the customer balance and writes a ledger entry on success', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const customer = await makeCustomer({ storeCreditBalance: 5000 });

    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'store_credit',
      customer: customer._id,
      cashier,
    });

    const updatedCustomer = await Customer.findById(customer._id);
    expect(updatedCustomer.storeCreditBalance).toBe(4000);

    const ledgerEntry = await StoreCreditLedger.findOne({ customer: customer._id });
    expect(ledgerEntry.amount).toBe(-1000);
    expect(ledgerEntry.reason).toBe('checkout_payment');
    expect(ledgerEntry.relatedSale.toString()).toBe(sale._id.toString());
  });

  test('rejects and rolls back stock when the customer balance is insufficient', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 10 });
    const customer = await makeCustomer({ storeCreditBalance: 500 });

    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'store_credit',
      customer: customer._id,
      cashier,
    })).rejects.toThrow(/Insufficient store credit balance/);

    // The whole transaction — including the stock decrement — must roll back.
    const unchangedVariant = await Variant.findById(variant._id);
    expect(unchangedVariant.stock).toBe(10);
    const unchangedCustomer = await Customer.findById(customer._id);
    expect(unchangedCustomer.storeCreditBalance).toBe(500);
  });

  test('rejects payment against a nonexistent customer', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'store_credit',
      customer: fakeId(),
      cashier,
    })).rejects.toThrow(/Insufficient store credit balance/);
  });

  test('concurrent debits against the same balance: only one of two equally-sized sales succeeds', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 100 });
    const customer = await makeCustomer({ storeCreditBalance: 1000 });

    const attempt = () => finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'store_credit',
      customer: customer._id,
      cashier,
    });

    const results = await Promise.allSettled([attempt(), attempt()]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason.message).toMatch(/Insufficient store credit balance/);

    const finalCustomer = await Customer.findById(customer._id);
    expect(finalCustomer.storeCreditBalance).toBe(0);
  });
});

describe('finalizeSale — gift card redemption (payment) atomic guard', () => {
  let cashier;
  beforeEach(async () => {
    cashier = (await makeUser()).id;
  });

  test('redeems partial balance, leaves the card active with the remainder', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const card = await makeGiftCard({ currentBalance: 3000 });

    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'gift_card',
      giftCardCode: card.code,
      cashier,
    });

    expect(sale.giftCardRedeemed.code).toBe(card.code);
    expect(sale.giftCardRedeemed.amount).toBe(1000);

    const updatedCard = await GiftCard.findById(card._id);
    expect(updatedCard.currentBalance).toBe(2000);
    expect(updatedCard.status).toBe('active');
  });

  test('flips the card to redeemed once the balance hits exactly zero', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const card = await makeGiftCard({ currentBalance: 1000 });

    await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'gift_card',
      giftCardCode: card.code,
      cashier,
    });

    const updatedCard = await GiftCard.findById(card._id);
    expect(updatedCard.currentBalance).toBe(0);
    expect(updatedCard.status).toBe('redeemed');
  });

  test('rejects redemption with insufficient balance, rolling back stock', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const card = await makeGiftCard({ currentBalance: 500 });

    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'gift_card',
      giftCardCode: card.code,
      cashier,
    })).rejects.toThrow(/Gift card not found, inactive, or insufficient balance/);

    const unchangedVariant = await Variant.findById(variant._id);
    expect(unchangedVariant.stock).toBe(5);
  });

  test('rejects redemption of an already-redeemed (inactive) card', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const card = await makeGiftCard({ currentBalance: 0, initialBalance: 1000, status: 'redeemed' });

    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'gift_card',
      giftCardCode: card.code,
      cashier,
    })).rejects.toThrow(/Gift card not found, inactive, or insufficient balance/);
  });

  test('gift card code lookup is case-insensitive / whitespace-tolerant', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const card = await makeGiftCard({ currentBalance: 1000 });

    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'gift_card',
      giftCardCode: `  ${card.code.toLowerCase()}  `,
      cashier,
    });
    expect(sale.giftCardRedeemed.code).toBe(card.code);
  });

  test('concurrent redemptions against the same card: only one succeeds', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 100 });
    const card = await makeGiftCard({ currentBalance: 1000 });

    const attempt = () => finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      paymentMethod: 'gift_card',
      giftCardCode: card.code,
      cashier,
    });

    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);

    const finalCard = await GiftCard.findById(card._id);
    expect(finalCard.currentBalance).toBe(0);
  });
});

describe('finalizeSale — selling gift cards as line items', () => {
  let cashier;
  beforeEach(async () => {
    cashier = (await makeUser()).id;
  });

  test('creates a gift card at face value and adds it to the sale total, independent of merchandise', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 3000, // 1000 merchandise + 2000 gift card face value
      paymentMethod: 'cash',
      giftCardsSold: [{ amount: 2000 }],
      cashier,
    });

    expect(sale.giftCardsSold).toHaveLength(1);
    expect(sale.giftCardsSold[0].amount).toBe(2000);

    const created = await GiftCard.findOne({ code: sale.giftCardsSold[0].code });
    expect(created.initialBalance).toBe(2000);
    expect(created.currentBalance).toBe(2000);
    expect(created.issuedBySale.toString()).toBe(sale._id.toString());
  });

  test('a merchandise cart discount does not apply to a gift card sold alongside it', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    // 1000 merchandise at 50% cart discount = 500, + 2000 gift card face value = 2500
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 2500,
      cartDiscount: 50,
      paymentMethod: 'cash',
      giftCardsSold: [{ amount: 2000 }],
      cashier,
    });
    expect(sale.totalAmount).toBe(2500);
  });
});

describe('finalizeSale — split-tender payments', () => {
  let cashier;
  beforeEach(async () => {
    cashier = (await makeUser()).id;
  });

  test('a 2-line cash+card split is accepted and persisted, paymentMethod becomes "split"', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'cash', amount: 600 }, { method: 'card', amount: 400 }],
      cashier,
    });

    expect(sale.paymentMethod).toBe('split');
    expect(sale.payments).toHaveLength(2);
    expect(sale.payments.map((p) => p.method).sort()).toEqual(['card', 'cash']);
  });

  test('a 3-line split combining cash, card, and store credit runs the store-credit atomic guard correctly', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const customer = await makeCustomer({ storeCreditBalance: 500 });

    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [
        { method: 'cash', amount: 300 },
        { method: 'card', amount: 400 },
        { method: 'store_credit', amount: 300, customer: customer._id },
      ],
      cashier,
    });

    expect(sale.paymentMethod).toBe('split');
    expect(sale.payments).toHaveLength(3);

    const updatedCustomer = await Customer.findById(customer._id);
    expect(updatedCustomer.storeCreditBalance).toBe(200); // 500 - 300

    const ledgerEntry = await StoreCreditLedger.findOne({ customer: customer._id });
    expect(ledgerEntry.amount).toBe(-300);
  });

  test('a split combining store credit and a gift card runs both atomic guards, each against its own line amount', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const customer = await makeCustomer({ storeCreditBalance: 1000 });
    const card = await makeGiftCard({ currentBalance: 1000 });

    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [
        { method: 'store_credit', amount: 700, customer: customer._id },
        { method: 'gift_card', amount: 300, giftCardCode: card.code },
      ],
      cashier,
    });

    expect(sale.giftCardRedeemed.amount).toBe(300);

    const updatedCustomer = await Customer.findById(customer._id);
    expect(updatedCustomer.storeCreditBalance).toBe(300); // 1000 - 700

    const updatedCard = await GiftCard.findById(card._id);
    expect(updatedCard.currentBalance).toBe(700); // 1000 - 300
  });

  test('rejects a split whose line amounts do not sum to the declared total', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'cash', amount: 300 }, { method: 'card', amount: 300 }],
      cashier,
    })).rejects.toThrow(/Payment amounts do not sum to the total amount/);
  });

  test('rejects a split that includes M-Pesa alongside another method', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'mpesa', amount: 500 }, { method: 'cash', amount: 500 }],
      cashier,
    })).rejects.toThrow(/M-Pesa cannot be combined/);
  });

  test('rejects two store-credit lines in one split', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const customer = await makeCustomer({ storeCreditBalance: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [
        { method: 'store_credit', amount: 500, customer: customer._id },
        { method: 'store_credit', amount: 500, customer: customer._id },
      ],
      cashier,
    })).rejects.toThrow(/Only one store-credit payment line/);
  });

  test('rejects two gift-card lines in one split', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const cardA = await makeGiftCard({ currentBalance: 500 });
    const cardB = await makeGiftCard({ currentBalance: 500 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [
        { method: 'gift_card', amount: 500, giftCardCode: cardA.code },
        { method: 'gift_card', amount: 500, giftCardCode: cardB.code },
      ],
      cashier,
    })).rejects.toThrow(/Only one gift-card payment line/);
  });

  test('rejects a split line with a zero/negative amount', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'cash', amount: 1000 }, { method: 'card', amount: 0 }],
      cashier,
    })).rejects.toThrow(/amount greater than 0/);
  });

  test('rejects insufficient store credit within a split, rolling back the whole transaction', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 }, { stock: 5 });
    const customer = await makeCustomer({ storeCreditBalance: 100 });

    await expect(finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'cash', amount: 500 }, { method: 'store_credit', amount: 500, customer: customer._id }],
      cashier,
    })).rejects.toThrow(/Insufficient store credit balance/);

    const unchangedVariant = await Variant.findById(variant._id);
    expect(unchangedVariant.stock).toBe(5);
    const unchangedCustomer = await Customer.findById(customer._id);
    expect(unchangedCustomer.storeCreditBalance).toBe(100);
  });

  test('a single-element payments array behaves exactly like the legacy flat paymentMethod (paymentMethod is not "split")', async () => {
    const { variant } = await makeStyleWithVariant({ basePrice: 1000 });
    const sale = await finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }],
      totalAmount: 1000,
      payments: [{ method: 'cash', amount: 1000 }],
      cashier,
    });
    expect(sale.paymentMethod).toBe('cash');
    expect(sale.payments).toHaveLength(1);
  });
});
