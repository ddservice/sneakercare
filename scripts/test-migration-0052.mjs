import {fixture,ids as i,uuid,serviceRole} from './lib/release-fixture.mjs';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const db=await fixture(['0046_receipt_posts_and_live_guards.sql','0048_security_boundaries.sql','0049_atomic_sales_and_payments.sql','0050_atomic_documents.sql','0051_finance_read_and_guards.sql']);
try {
 await db.exec('create table inv_purchase_receipts(id uuid,tenant_id uuid,purchase_date date,paid_amount numeric);alter table inv_purchase_receipts enable row level security;');
 await db.exec(`create table extension_layer.ext_slip_verifications(id uuid);create table sc_wht_payees(id uuid,tenant_id uuid);create table sc_wht_certificates(id uuid,tenant_id uuid,payee_id uuid,payment_date date);create table sc_expenses(id bigint,tenant_id uuid,date date,amount numeric);`);
 await db.query("insert into sc_opex(tenant_id,month,amount) values($1,'11/2026',100)",[i.tenant]);
 await db.exec(fs.readFileSync('supabase/migrations/0052_accountant_handoff.sql','utf8'));
 await serviceRole(db);
 const sale=(await db.query('select rrs_save_sale($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,uuid(500),JSON.stringify({date:'2026-10-01',gross:100,discount:0,net:100,cash:20,transfer:0,paid:20})])).rows[0].r;
 await db.query('select rrs_record_payment($1,$2,$3,$4::jsonb)',[i.admin,i.tenant,uuid(501),JSON.stringify({sale_id:sale.id,received_date:'2026-11-04',amount:30,pay_method:'โอน'})]);
 const read=(tenant=i.tenant,actor=i.admin)=>db.query('select rrs_accountant_packet($1,$2,$3) r',[actor,tenant,'2026-11']).then(r=>r.rows[0].r);
 const packet=await read();
 assert.equal(packet.sales.length,0);assert.equal(packet.payments.length,1);assert.equal(Number(packet.balances[0].balance_end),50);assert.equal(packet.unmatched.length,0);assert.equal(packet.opex_source.length,1);
 await assert.rejects(read(i.other),/ไม่มีสิทธิ์/);await assert.rejects(read(i.tenant,i.staff),/ไม่มีสิทธิ์/);
 await db.exec('reset role;set role authenticated');await assert.rejects(read(),/permission denied/);
 console.log('0052 PASS: receipts selected by received date, prior-month receivables balance and accountant tenant/role boundary');
}finally{await db.close();}
