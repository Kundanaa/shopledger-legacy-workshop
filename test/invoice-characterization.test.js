var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function makeOrder(items, coupon) {
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 41,
    date: '2026-11-21',
    customer: 'A Customer',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice uses the HSN GST slab used by order pricing', function () {
  var order = makeOrder([{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }]);
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 5);
  assert.equal(order.total, 105);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.tax, 5);
  assert.equal(figures.total, 105);
});

test('invoice applies coupon to subtotal before calculating GST', function () {
  var order = makeOrder([{ id: 1, name: 'Rice', hsn: '1006', price: 1000, qty: 1 }], 'WELCOME');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(order.discount, 50);
  assert.equal(order.tax, 47.5);
  assert.equal(order.total, 997.5);
  assert.equal(figures.discount, 50);
  assert.equal(figures.tax, 47.5);
  assert.equal(figures.total, 997.5);
});

test('GST reconciliation matches an order priced with an HSN slab', function () {
  var order = makeOrder([{ id: 1, name: 'Rice', hsn: '1006', price: 100, qty: 1 }]);
  var result = reports.getGstReconciliation({ orders: [order] });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.deepEqual(result.rows[0], {
    orderId: 41,
    date: '2026-11-21',
    customer: 'A Customer',
    coupon: '',
    ledgerSubtotal: 100,
    ledgerDiscount: 0,
    ledgerTax: 5,
    ledgerTotal: 105,
    invoiceDiscount: 0,
    invoiceTax: 5,
    invoiceTotal: 105,
    delta: 0,
    matched: true
  });
});

test('invoice resolves a decimal gstRate using the tax module convention', function () {
  var order = { items: [{ name: 'Item', price: 100, qty: 1, gstRate: 0.05 }] };
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.tax, 5);
  assert.equal(figures.total, 105);
});

test('invoice figures match the checkout GST breakdown and billed total', function () {
  var items = [
    { id: 1, name: 'Rice', hsn: '1006', price: 640, qty: 1 },
    { id: 4, name: 'Oil', hsn: '1512', price: 190, qty: 2 }
  ];
  var order = makeOrder(items, 'SAVE10');
  var expected = pricing.computeTotals(items, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(order);

  assert.equal(figures.subtotal, expected.subtotal);
  assert.equal(figures.discount, expected.discount);
  assert.equal(figures.tax, expected.tax);
  assert.equal(figures.cgst, expected.cgst);
  assert.equal(figures.sgst, expected.sgst);
  assert.equal(figures.total, order.total);
  assert.deepEqual(figures.rows.map(function (row) { return row.lineTax; }), [28.8, 17.1]);
});
