import {fixture,ids as i,uuid,serviceRole} from './lib/release-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const db=await fixture();
try {
 await serviceRole(db);
 const sale={date:'2026-10-01',gross:200,discount:0,net:200,cash:0,transfer:0,paid:0};
 const save=(key,data)=>db.query('select rrs_save_sale($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,key,JSON.stringify(data)]).then(r=>r.rows[0].r);
 const s=await save(uuid(300),sale);
 await db.exec('reset role');
 await db.query(`insert into sc_payments(tenant_id,sale_date,received_date,amount,pay_method) values($1,'2026-10-01','2026-10-02',50,'โอน')`,[i.tenant]);
 await serviceRole(db);
 await assert.rejects(save(uuid(301),{...sale,id:s.id,version:1,net:20,gross:20}),/เงินรับเก่า/);
 await db.exec('reset role');
 await db.query(`insert into sc_settings values($1,'closed_periods','["2026-10"]',now())`,[i.tenant]);
 await db.exec(fs.readFileSync('supabase/migrations/0051_finance_read_and_guards.sql','utf8'));
 assert.equal(Number((await db.query('select sale_id from sc_payments')).rows[0].sale_id),s.id);
 await serviceRole(db);
 const read=await db.query('select rrs_read_sales($1,$2,300) r',[i.admin,i.tenant]);
 assert.equal(read.rows[0].r.rows[0].payments.length,1);
 await db.query('select rrs_record_payment($1,$2,$3,$4::jsonb)',[i.admin,i.tenant,uuid(302),JSON.stringify({sale_id:s.id,received_date:'2026-11-04',amount:150,pay_method:'โอน'})]);
 await assert.rejects(db.query('select rrs_delete_sale($1,$2,$3,2)',[i.admin,i.tenant,s.id]),/ปิดแล้ว/);
 await db.exec('reset role; set role authenticated');
 for(const t of ['sc_sales','sc_payments','service_orders','service_order_items','customers']) {
  const r=await db.query("select has_table_privilege('authenticated',$1,'INSERT') or has_table_privilege('authenticated',$1,'UPDATE') or has_table_privilege('authenticated',$1,'DELETE') permitted",[t]);
  assert.equal(r.rows[0].permitted,false,t);
 }
 console.log('0051 PASS: deterministic legacy links preserve money, closed-period collection, read model and direct-write denial');
} finally {await db.close();}
