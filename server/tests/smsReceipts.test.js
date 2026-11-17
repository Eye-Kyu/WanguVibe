const salesController = require('../controllers/salesController');
const Sale = require('../models/Sale');
const { getOutbox, clearOutbox } = require('../services/sms');
const { toE164Kenya, phoneVariants, maskPhone } = require('../utils/phone');
const { makeStyleWithVariant, makeCustomer, makeUser } = require('./fixtures');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('phone helpers', () => {
  test.each([
    ['0712345678', '+254712345678'],
    ['712345678', '+254712345678'],
    ['254712345678', '+254712345678'],
    ['+254 712 345 678', '+254712345678'],
    ['0110123456', '+254110123456'],
    ['12345', null],
    ['', null],
  ])('toE164Kenya(%p) = %p', (input, expected) => {
    expect(toE164Kenya(input)).toBe(expected);
  });

  test('phoneVariants covers every stored form', () => {
    expect(phoneVariants('+254712345678')).toEqual(expect.arrayContaining(['0712345678', '254712345678', '+254712345678']));
  });

  test('maskPhone hides the middle digits', () => {
    expect(maskPhone('0712345678')).toBe('+254••••678');
  });
});

describe('SMS receipts', () => {
  let cashier, sale, customer;
  beforeEach(async () => {
    clearOutbox();
    cashier = await makeUser();
    customer = await makeCustomer({ phone: '0712345678' });
    const { variant } = await makeStyleWithVariant({ name: 'Linen Shirt', basePrice: 2500 });
    sale = await salesController.finalizeSale({
      items: [{ variant: variant._id, quantity: 1, discount: 0 }], totalAmount: 2500, paymentMethod: 'mpesa', customer: customer.id, cashier: cashier.id,
    });
  });

  async function send(body = {}) {
    const res = mockRes();
    await salesController.sendReceiptSms({ params: { id: sale.id }, body, user: { id: cashier.id } }, res);
    return res;
  }

  test('texts the receipt to the customer on file', async () => {
    const res = await send();
    expect(res.json.mock.calls[0][0].to).toBe('+254••••678');
    const [msg] = getOutbox();
    expect(msg.to).toBe('+254712345678');
    expect(msg.message).toMatch(/receipt #[A-F0-9]{8}/);
    expect(msg.message).toMatch(/1x Linen Shirt M\/Black/);
    expect(msg.message).toMatch(/KES 2,500\.00 \(M-Pesa\)/);
    expect(msg.message).toMatch(/KRA invoice/);
    const after = await Sale.findById(sale.id);
    expect(after.receiptSms.status).toBe('sent');
    expect(after.receiptSms.to).toBe('+254••••678'); // never the full number on the sale
  });

  test('can send to a number given at the till', async () => {
    await send({ phone: '0722000111' });
    expect(getOutbox()[0].to).toBe('+254722000111');
  });

  test('rejects an invalid number and voided sales', async () => {
    expect((await send({ phone: '123' })).status).toHaveBeenCalledWith(400);
    await Sale.updateOne({ _id: sale.id }, { status: 'voided' });
    expect((await send()).status).toHaveBeenCalledWith(400);
    expect(getOutbox()).toHaveLength(0);
  });

  test('keeps the message within three SMS segments for big carts', () => {
    const big = {
      _id: sale._id, totalAmount: 99999, paymentMethod: 'split', createdAt: new Date(), etimsInvoiceNumber: 'KRACU0100000001/123',
      items: Array.from({ length: 30 }, (_, i) => ({ quantity: 1, styleName: `Item ${i}`, size: 'XL', color: 'Navy' })),
    };
    const text = salesController.buildReceiptSms(big);
    expect(text).toMatch(/\+28 more/);
    expect(text.length).toBeLessThan(459);
  });
});
