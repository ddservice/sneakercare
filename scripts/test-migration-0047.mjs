import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const migration = fs.readFileSync('supabase/migrations/0047_purchase_receipts.sql','utf8');
const baseline = fs.readFileSync('supabase/migrations/0001_init.sql','utf8');
const stockTrigger = baseline.match(/create or replace function fn_apply_stock_transaction\(\)[\s\S]*?\$\$ language plpgsql security definer;/)[0];
const auditTrigger = baseline.match(/create or replace function fn_write_audit_log\(\)[\s\S]*?\$\$ language plpgsql security definer;/)[0];
const ids = Array.from({length:9},(_,i)=>`00000000-0000-0000-0000-${String(i+1).padStart(12,'0')}`);
const [tenant,otherTenant,branch,otherBranch,admin,co,staff,superAdmin,item] = ids;
const key = n => `11111111-0000-0000-0000-${String(n).padStart(12,'0')}`;

for (const prefixed of [false,true]) {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table tenants(id uuid primary key);
      insert into tenants values ('${tenant}'),('${otherTenant}');
      create table profiles(id uuid primary key, role text, tenant_id uuid, branch_id uuid, is_active boolean default true);
      insert into profiles values ('${admin}','admin','${tenant}',null,true),('${co}','co_admin','${tenant}','${branch}',true),
        ('${staff}','staff','${tenant}','${branch}',true),('${superAdmin}','super_admin',null,null,true);
      create table branches(id uuid primary key,tenant_id uuid,is_active boolean default true);
      insert into branches values ('${branch}','${tenant}',true),('${otherBranch}','${otherTenant}',true);
      create table items(id uuid primary key default gen_random_uuid(),name text,category text,base_unit text,purchase_unit text,
        purchase_unit_qty numeric, item_type text,default_min_stock_level numeric default 0,tenant_id uuid,is_active boolean default true);
      insert into items values ('${item}','ถุง 30x40','บรรจุภัณฑ์','ใบ','แพ็ก',100,'consumable',1,'${tenant}',true);
      create table item_stock(item_id uuid,branch_id uuid,current_qty numeric(14,3),avg_unit_cost numeric(14,4),min_stock_level numeric,updated_at timestamptz,unique(item_id,branch_id));
      create table stock_transactions(id uuid primary key default gen_random_uuid(),item_id uuid references items(id),branch_id uuid references branches(id),tenant_id uuid,
        txn_type text,status text default 'approved',quantity_delta numeric(14,3),unit_cost_snapshot numeric(14,4),
        total_cost numeric(14,2) generated always as (abs(quantity_delta)*unit_cost_snapshot) stored,
        reference_type text,reference_note text,performed_by uuid,created_at timestamptz default now());
      create type audit_action as enum ('INSERT','UPDATE','DELETE');
      create table audit_logs(table_name text,record_id text,action audit_action,performed_by uuid,before_data jsonb,after_data jsonb,reason text);
      ${stockTrigger}
      ${auditTrigger}
      alter function fn_apply_stock_transaction() set search_path = public, pg_temp;
      alter function fn_write_audit_log() set search_path = public, pg_temp;
      create trigger apply_stock before insert on stock_transactions for each row execute function fn_apply_stock_transaction();
      create trigger audit_stock after insert on stock_transactions for each row execute function fn_write_audit_log();
      alter table profiles enable row level security;
      alter table branches enable row level security;
      alter table items enable row level security;
      alter table stock_transactions enable row level security;
    `);
    if (prefixed) {
      for (const n of ['items','branches','stock_transactions','item_stock']) await db.exec(`alter table ${n} rename to inv_${n}; create view ${n} as select * from inv_${n};`);
      await db.exec(stockTrigger.replace(/\bitem_stock\b/g,'inv_item_stock').replace(/\bitems\b/g,'inv_items'));
      await db.exec('alter function fn_apply_stock_transaction() set search_path = public, pg_temp;');
    }
    await db.exec(migration);
    await db.exec(migration); // Idempotent DDL.
    const as = async uid => { await db.exec('reset role'); await db.query(`select set_config('test.uid',$1,false),set_config('request.jwt.claim.sub',$1,false)`,[uid??'']); await db.exec('set role authenticated'); };
    const payload = { item_id:item,purchase_date:'2026-10-01',supplier_name:'ร้าน A',purchase_unit:'แพ็ก',purchase_qty:2,units_per_pack:100,
      goods_amount:400,shipping_amount:40,discount_amount:20,reference_note:'บิล 123' };
    const receive = (k,data=payload,b=branch) => db.query(`select public.inv_fn_receive_purchase($1,$2,$3::jsonb) id`,[b,key(k),JSON.stringify(data)]);
    await as(admin);
    const first = await receive(1);
    assert.equal((await receive(1)).rows[0].id,first.rows[0].id);
    await assert.rejects(receive(1,{...payload,goods_amount:401}),/คีย์เดิม/);
    await assert.rejects(db.query('select * from inv_purchase_receipts'),/permission denied/);
    await assert.rejects(receive(2,payload,otherBranch),/ไม่มีสิทธิ์/);
    for (const bad of [{units_per_pack:0},{goods_amount:'NaN'},{discount_amount:999},{purchase_date:'2999-01-01'},{unknown_field:1}]) await assert.rejects(receive(2,{...payload,...bad}));
    await receive(2,{...payload,purchase_qty:3,units_per_pack:50,goods_amount:300});
    const history = await db.query(`select inv_fn_purchase_history($1,'2026-01-01','2026-12-31') data`,[branch]);
    assert.equal(history.rows[0].data.length,2);
    assert.equal(history.rows[0].data[0].payload,undefined);
    await db.exec('reset role');
    await db.query(`insert into branches values ($1,$2,true)`,[key(99),tenant]);
    await as(co); await receive(3); await assert.rejects(receive(4,payload,otherBranch),/ไม่มีสิทธิ์/);
    await assert.rejects(receive(4,payload,key(99)),/ไม่มีสิทธิ์/);
    await as(staff); await assert.rejects(receive(4),/ไม่มีสิทธิ์/);
    await assert.rejects(db.query(`select inv_fn_purchase_history($1,'2026-01-01','2026-12-31')`,[branch]),/ไม่มีสิทธิ์/);
    await as(null); await assert.rejects(receive(4),/ไม่มีสิทธิ์/);
    await db.exec('reset role; set role anon'); await assert.rejects(receive(4),/permission denied/);
    await as(superAdmin); await assert.rejects(receive(4,payload,otherBranch),/ไม่พบสินค้า/);
    const newData = { ...payload,item_id:'',new_item_name:'ถุงอีกแบบ',new_item_category:'บรรจุภัณฑ์',new_item_unit:'ใบ',new_min_stock:10 };
    await receive(4,newData,otherBranch);
    await db.exec('reset role');
    assert.equal(Number((await db.query(`select current_qty from item_stock where item_id=$1 and branch_id=$2`,[item,branch])).rows[0].current_qty),550);
    assert.equal(Number((await db.query(`select avg_unit_cost from item_stock where item_id=$1 and branch_id=$2`,[item,branch])).rows[0].avg_unit_cost),2.1091);
    assert.equal(Number((await db.query('select count(*) n from stock_transactions')).rows[0].n),4);
    assert.equal(Number((await db.query(`select count(*) n from audit_logs where table_name='inv_purchase_receipts'`)).rows[0].n),4);
    await assert.rejects(db.exec(`delete from inv_purchase_receipts`),/แก้ไขหรือลบไม่ได้/);
    await assert.rejects(db.exec(`update inv_purchase_receipts set supplier_name='x'`),/แก้ไขหรือลบไม่ได้/);
    // Any receipt failure after stock INSERT rolls back movement and newly created SKU too.
    await db.exec(`create function fail_purchase_test() returns trigger language plpgsql as $$ begin raise exception 'test rollback'; end $$;
      create trigger fail_purchase before insert on inv_purchase_receipts for each row execute function fail_purchase_test();`);
    const before = (await db.query('select count(*) n from items')).rows[0].n;
    await as(admin); await assert.rejects(receive(5,newData),/test rollback/);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*) n from items')).rows[0].n,before);
    assert.equal(Number((await db.query('select count(*) n from stock_transactions')).rows[0].n),4);
    console.log(`0047 ${prefixed?'inv_* + aliases':'legacy tables'}: atomic stock, replay, validation, tenant/role isolation, audit, rollback PASS`);
  } finally { await db.close(); }
}
