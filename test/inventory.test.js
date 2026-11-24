const test = require('node:test');
const assert = require('node:assert/strict');
const inventory = require('../lib/inventory');
const orders = require('../lib/orders');

test('CURRENT BEHAVIOUR: reservations reduce sellable stock and excess quantities are rejected', () => {
  const products = [{ id: 6, name: 'Ghee', stock: 4, reserved: 3 }];
  assert.equal(inventory.getSellableStock(products[0]), 1);
  assert.equal(inventory.check(products, [{ id: 6, qty: 2 }]).ok, false);
});

test('The last sellable unit and exact remaining quantities can be purchased', () => {
  for (const [stock, reserved] of [[1, 0], [4, 3], [8, 2]]) {
    const products = [{ id: 6, name: 'Ghee', stock, reserved }];
    const items = [{ id: 6, qty: stock - reserved }];
    assert.equal(inventory.check(products, items).ok, true);
    inventory.reserve(products, items);
    assert.equal(products[0].stock, reserved);
    assert.equal(products[0].reserved, reserved);
    assert.equal(inventory.getSellableStock(products[0]), 0);
  }
});

test('Cancelling an order restores physical stock once and leaves reservations intact', () => {
  const db = {
    products: [{ id: 6, stock: 1, reserved: 0 }, { id: 4, stock: 22, reserved: 4 }],
    customers: [{ id: 4, openingBalance: 1200, totalBilled: 1407, totalSettled: 1000 }],
    orders: [{ id: 1007, status: 'pending', customerId: 4, paymentMode: 'khata', total: 1407,
      items: [{ id: 6, qty: 2 }, { id: 4, qty: 2 }] }]
  };
  assert.equal(orders.cancel(db, 1007).ok, true);
  assert.deepEqual(db.products, [{ id: 6, stock: 3, reserved: 0 }, { id: 4, stock: 24, reserved: 4 }]);
  assert.equal(inventory.getSellableStock(db.products[1]), 20);
  assert.equal(db.customers[0].totalBilled, 0);
  assert.equal(db.customers[0].balance, 200);
  assert.equal(orders.cancel(db, 1007).ok, false);
  assert.equal(db.products[0].stock, 3);
});
