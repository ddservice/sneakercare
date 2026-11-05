import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import {expenseFixtureSql} from './lib/expense-fixture.mjs';
import {fixtureSql,ids as i,uuid} from './lib/release-fixture.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rrs-finance-'));
const port=55700+Math.floor(Math.random()*200);
const server=new EmbeddedPostgres({databaseDir:dir,user:'postgres',password:'postgres',port,persistent:false,initdbFlags:['--encoding=UTF8'],onLog:()=>{},onError:()=>{}});
const clients=[];
try {
 await server.initialise(); await server.start();
 for(let n=0;n<2;n++){const c=new pg.Client({host:'127.0.0.1',port,user:'postgres',password:'postgres',database:'postgres'});await c.connect();clients.push(c);}
 const [a,b]=clients;
 await a.query(fixtureSql());
 for(const m of ['0046_receipt_posts_and_live_guards.sql','0048_security_boundaries.sql','0049_atomic_sales_and_payments.sql','0050_atomic_documents.sql','0051_finance_read_and_guards.sql','0053_actor_write_throttle.sql'])await a.query(fs.readFileSync(`supabase/migrations/${m}`,'utf8'));
 await a.query(expenseFixtureSql());
 await a.query(fs.readFileSync('supabase/migrations/0054_atomic_custom_expenses.sql','utf8'));
 for(const c of clients)await c.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
 const save=await a.query('select rrs_save_sale($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,uuid(401),JSON.stringify({date:'2026-11-04',gross:100,discount:0,net:100,cash:0,transfer:0,paid:0})]);
 const saleId=save.rows[0].r.id;
 const pay=(c,key,amount,actor=i.admin)=>c.query('select rrs_record_payment($1,$2,$3,$4::jsonb) r',[actor,i.tenant,key,JSON.stringify({sale_id:saleId,received_date:'2026-11-04',amount,pay_method:'โอน'})]);
 const race=await Promise.allSettled([pay(a,uuid(402),70),pay(b,uuid(403),70,i.co)]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 const replay=await Promise.all([pay(a,uuid(404),30),pay(b,uuid(404),30)]);
 assert.equal(replay[0].rows[0].r.id,replay[1].rows[0].r.id);
 const doc=(await a.query('select rrs_create_document($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,uuid(405),JSON.stringify({branch_id:i.branch,doc_type:'INVOICE',issue_date:'2026-11-04',charge_vat:false,contact:{company_name:'race'},items:[{name:'clean',quantity:1,unit_price:100,discount:0,total:100}]})])).rows[0].r;
 const issue=c=>c.query('select rrs_issue_document($1,$2,$3) r',[i.admin,i.tenant,doc.id]);
 const issued=await Promise.all([issue(a),issue(b)]);
 assert.equal(issued[0].rows[0].r.doc_number,issued[1].rows[0].r.doc_number);
 // Two distinct requests must share one actor budget even before either commits.
 await a.query('reset role');
 await a.query('truncate rrs_private.commands');
 await a.query("insert into rrs_private.commands(tenant_id,command,request_id,actor_id,payload,response) select $1,'seed',g::text,$2,'{}','{}' from generate_series(1,59) g",[i.tenant,i.admin]);
 await a.query('set role service_role');
 const sale={date:'2026-11-05',gross:100,discount:0,net:100,cash:100,transfer:0,paid:100};
 const saveSale=(c,key)=>c.query('select rrs_save_sale($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,key,JSON.stringify(sale)]);
 await a.query('begin');await b.query('begin');
 const first=await saveSale(a,uuid(801));
 // Register rejection immediately; B waits on A's actor lock until commit.
 const second=saveSale(b,uuid(802)).then(()=>({ok:true}),error=>({ok:false,error}));
 await a.query('commit');
 const denied=await second;
 assert.equal(denied.ok,false);assert.match(denied.error.message,/ทำรายการถี่เกินไป/);
 await b.query('rollback');
 const retried=await saveSale(b,uuid(801));
 assert.equal(retried.rows[0].r.id,first.rows[0].r.id);
 assert.equal(retried.rows[0].r.replay,true);
 await a.query('reset role');
 assert.equal(Number((await a.query('select count(*) n from rrs_private.commands where actor_id=$1',[i.admin])).rows[0].n),60);
 console.log('THROTTLE PG PASS: concurrent distinct keys enforce 60/min; retry still returns the committed result');
 await b.query('reset role');
 const certificate=c=>c.query("insert into sc_wht_certificates(tenant_id,direction,form_type,certificate_number,payment_date,base_amount,gross_amount,wht_rate,tax_amount,net_payment) values($1,'payable','PND3','ignored','2026-11-05',100,100,3,3,97) returning certificate_number",[i.tenant]);
 const certificates=await Promise.all([certificate(a),certificate(b)]);
 assert.deepEqual(certificates.map(r=>r.rows[0].certificate_number).sort(),['WHT-202611-0001','WHT-202611-0002']);
 await a.query('begin');await certificate(a);await a.query('rollback');
 assert.equal((await certificate(b)).rows[0].certificate_number,'WHT-202611-0003');
 console.log('WHT PG PASS: two concurrent writers allocate distinct numbers; rollback consumes no number');
 console.log('FINANCE PG PASS: two connections prevent overpayment, replay one receipt and consume one document number');
} finally {
 for(const c of clients)await c.end().catch(()=>{});
 await server.stop().catch(()=>{});
 const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('rrs-finance-'));
 fs.rmSync(resolved,{recursive:true,force:true});
}
