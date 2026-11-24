const test = require('node:test');
const assert = require('node:assert/strict');
const orders = require('../lib/orders');
const dates = require('../lib/dates');
const ledger = require('../lib/ledger');

function orderDb() {
  return { orders: [
    { id: 1001, date: '28/12/2021' }, { id: 1002, date: '05/01/2022' },
    { id: 1003, date: '01/01/2022' }, { id: 1004, date: '30/01/2022' },
    { id: 1005, date: '31/01/2022' }, { id: 1006, date: '02/02/2022' },
    { id: 1007, date: '04/03/2022' }, { id: 1008, date: '15/03/2022' }
  ] };
}

function customerDb() {
  return { nextSettlementId: 505, settlements: [], customers: [{ id: 1, name: 'Meera',
    openingBalance: 450, totalBilled: 1982.01, totalSettled: 1200, balance: 1232.01 }] };
}

test('CURRENT BEHAVIOUR: fiscal year boundaries and numeric settlement metadata are preserved', () => {
  assert.equal(dates.getFiscalYear('31/03/2022'), 'FY21-22');
  assert.equal(dates.getFiscalYear('2022-04-01'), 'FY22-23');
  const db = customerDb();
  const result = ledger.recordSettlement(db, 1, 500, 'cash', 'Counter payment');
  assert.equal(result.ok, true);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(result.settlement.id, 505);
  assert.equal(result.settlement.mode, 'cash');
  assert.equal(result.settlement.note, 'Counter payment');
  assert.match(result.settlement.date, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(db.nextSettlementId, 506);
});

test('Order history sorts by calendar date across months and years without changing stored dates', () => {
  const db = orderDb();
  const original = structuredClone(db);
  assert.deepEqual(orders.list(db).map(o => o.id), [1008, 1007, 1006, 1005, 1004, 1002, 1003, 1001]);
  assert.deepEqual(db, original);
  const equalDates = { orders: [{ id: 1, date: '05/01/2022' }, { id: 2, date: '05/01/2022' }] };
  assert.deepEqual(orders.list(equalDates).map(o => o.id), [1, 2]);
});

test('Date ranges include endpoints with ISO or display dates and support one-sided filters', () => {
  const db = orderDb();
  for (const [from, to] of [['2022-01-01', '2022-01-31'], ['01/01/2022', '31/01/2022']]) {
    assert.deepEqual(orders.list(db, { from, to }).map(o => o.id), [1005, 1004, 1002, 1003]);
  }
  assert.deepEqual(orders.list(db, { from: '2022-02-01' }).map(o => o.id), [1008, 1007, 1006]);
  assert.deepEqual(orders.list(db, { to: '2021-12-31' }).map(o => o.id), [1001]);
});

test('String settlement amounts are added numerically and repeated payments preserve money totals', () => {
  const db = customerDb();
  const result = ledger.recordSettlement(db, '1', '500', 'upi', 'Payment');
  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(result.settlement.amount, 500);
  ledger.recordSettlement(db, 1, '0.10');
  ledger.recordSettlement(db, 1, '0.20');
  assert.equal(db.customers[0].totalSettled, 1700.3);
  assert.equal(db.customers[0].balance, 731.71);
  assert.equal(ledger.listCustomers(db)[0].balance, 731.71);
  assert.equal(db.settlements.length, 3);
});

test('Invalid settlement amounts do not mutate the customer, settlements, or counter', () => {
  for (const amount of ['', ' ', 'invalid', 'Infinity', Infinity, NaN, 0, -1, null, undefined, {}, []]) {
    const db = customerDb();
    const original = structuredClone(db);
    assert.equal(ledger.recordSettlement(db, 1, amount).ok, false, String(amount));
    assert.deepEqual(db, original);
  }
});
