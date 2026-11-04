import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
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
 for(const m of ['0046_receipt_posts_and_live_guards.sql','0048_security_boundaries.sql','0049_atomic_sales_and_payments.sql','0050_atomic_documents.sql','0051_finance_read_and_guards.sql'])await a.query(fs.readFileSync(`supabase/migrations/${m}`,'utf8'));
 for(const c of clients)await c.query(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
 const save=await a.query('select rrs_save_sale($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,uuid(401),JSON.stringify({date:'2026-11-04',gross:100,discount:0,net:100,cash:0,transfer:0,paid:0})]);
 const saleId=save.rows[0].r.id;
 const pay=(c,key,amount)=>c.query('select rrs_record_payment($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,key,JSON.stringify({sale_id:saleId,received_date:'2026-11-04',amount,pay_method:'โอน'})]);
 const race=await Promise.allSettled([pay(a,uuid(402),70),pay(b,uuid(403),70)]);
 assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
 const replay=await Promise.all([pay(a,uuid(404),30),pay(b,uuid(404),30)]);
 assert.equal(replay[0].rows[0].r.id,replay[1].rows[0].r.id);
 const doc=(await a.query('select rrs_create_document($1,$2,$3,$4::jsonb) r',[i.admin,i.tenant,uuid(405),JSON.stringify({branch_id:i.branch,doc_type:'INVOICE',issue_date:'2026-11-04',charge_vat:false,contact:{company_name:'race'},items:[{name:'clean',quantity:1,unit_price:100,discount:0,total:100}]})])).rows[0].r;
 const issue=c=>c.query('select rrs_issue_document($1,$2,$3) r',[i.admin,i.tenant,doc.id]);
 const issued=await Promise.all([issue(a),issue(b)]);
 assert.equal(issued[0].rows[0].r.doc_number,issued[1].rows[0].r.doc_number);
 console.log('FINANCE PG PASS: two connections prevent overpayment, replay one receipt and consume one document number');
} finally {
 for(const c of clients)await c.end().catch(()=>{});
 await server.stop().catch(()=>{});
 const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('rrs-finance-'));
 fs.rmSync(resolved,{recursive:true,force:true});
}
