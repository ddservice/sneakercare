import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { purchaseTotals, validatePurchase, summarizePurchases } = require('../.test-build/purchase-receipts.js');
const input = { item_id:'sku1', new_item_name:'',new_item_unit:'',new_item_category:'',new_min_stock:0,
  purchase_date:'2026-10-10',supplier_name:'ร้าน A',purchase_unit:'แพ็ก',purchase_qty:2,units_per_pack:100,
  goods_amount:400,shipping_amount:40,discount_amount:20,reference_note:'' };
assert.equal(validatePurchase(input,'2026-11-04'),null);
assert.deepEqual(purchaseTotals(2,100,400,40,20), { baseQuantity:200,paid:420,unitPrice:2.1 });
for (const invalid of [ { purchase_qty:0 },{ units_per_pack:NaN },{ goods_amount:Infinity },{ discount_amount:500 },
  { purchase_date:'2026-02-30' },{ purchase_date:'2027-01-01' },{ supplier_name:' ' },{ goods_amount:1.234 },{ purchase_qty:0.00001 } ]) {
  assert.ok(validatePurchase({...input,...invalid},'2026-11-04'));
}
const row = (id,supplier,qty,paid,date='2026-10-10') => ({ id,item_id:'sku1',supplier_name:supplier,base_quantity:qty,paid_amount:paid,purchase_date:date,created_at:`${date}T10:00:00Z` });
const rows = [row('1','ร้าน A',100,100),row('2',' ร้าน A ',300,600,'2026-10-11'),row('3','ร้าน B',50,75,'2026-11-01')];
const stats = summarizePurchases(rows);
assert.equal(stats.suppliers.find(s=>s.name.trim()==='ร้าน A').average,1.75);
assert.equal(stats.best.name,'ร้าน B'); // Latest A is 2, B is 1.5; old A=1 is not a quote.
assert.equal(stats.months[0].paid/stats.months[0].quantity,1.75);
assert.equal(stats.months[0].min,1); assert.equal(stats.months[0].max,2);
assert.equal(summarizePurchases([...rows,row('4','แจกฟรี',10,0)]).best.name,'ร้าน B');
assert.throws(()=>summarizePurchases([...rows,{...rows[0],item_id:'other-size'}]));
assert.throws(()=>summarizePurchases([...rows,{...rows[0],base_unit:'แพ็ก'}]));
assert.equal(summarizePurchases([]).best,undefined);
console.log('purchase totals, validation, weighted averages, latest quotes, SKU isolation: PASS');
