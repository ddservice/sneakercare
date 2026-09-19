#!/usr/bin/env node
/**
 * รัน migration 0044 (ปฏิเสธเบิกเกิน + คีย์กันกดซ้ำ) ผ่าน PGlite
 *
 * ตรวจ:
 *   1. ก่อนแก้: เบิกเกินถูกปัดเหลือ 0
 *   2. หลังแก้: เบิกเกินถูกปฏิเสธ ยอดคงเหลือไม่ขยับ
 *   3. ของชิ้นสุดท้ายเบิกได้หนึ่งครั้ง ครั้งที่สองล้ม
 *   4. อนุมัติปรับลดเกินถูกปฏิเสธ
 *   5. client_request_id ซ้ำใน tenant เดียวกันไม่ได้
 *   6. รันซ้ำได้ · rollback คืนพฤติกรรมเดิม
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0044_reject_overissue_and_idempotency.sql"), "utf8");
const rollback = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0044_rollback.sql"), "utf8");

const db = new PGlite();
let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
function check(cond, okMsg, badMsg) {
  if (cond) ok(okMsg);
  else bad(badMsg);
}

const T1 = "00000000-0000-0000-0000-000000000001";
const BRANCH = "10000000-0000-0000-0000-0000000000b1";
const ITEM = "30000000-0000-0000-0000-000000000001";
const ADMIN = "10000000-0000-0000-0000-000000000001";

console.log("\n[0044] ปฏิเสธเบิกเกิน + idempotency");

await db.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select '${ADMIN}'::uuid
  $$;

  create table public.tenants (id uuid primary key, name text not null);
  insert into public.tenants values ('${T1}', 'T1');

  create table public.profiles (
    id uuid primary key,
    role text not null,
    branch_id uuid,
    tenant_id uuid,
    is_active boolean not null default true
  );
  insert into public.profiles (id, role, branch_id, tenant_id)
  values ('${ADMIN}', 'admin', '${BRANCH}', '${T1}');

  create table public.inv_item_stock (
    item_id uuid not null,
    branch_id uuid not null,
    current_qty numeric not null default 0,
    updated_at timestamptz,
    primary key (item_id, branch_id)
  );
  insert into public.inv_item_stock (item_id, branch_id, current_qty)
  values ('${ITEM}', '${BRANCH}', 1);

  create table public.inv_stock_transactions (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null,
    branch_id uuid not null,
    txn_type text not null,
    status text not null default 'approved',
    quantity_delta numeric not null,
    approved_by uuid
  );

  create or replace function public.inv_fn_current_role() returns text
  language sql stable as $$ select 'admin'::text $$;

  create or replace function public.inv_fn_current_branch() returns uuid
  language sql stable as $$ select '${BRANCH}'::uuid $$;

  create or replace function public.inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
  returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
  declare v_txn inv_stock_transactions%rowtype;
  begin
    if inv_fn_current_role() not in ('admin', 'co-admin', 'super_admin') then
      raise exception 'denied';
    end if;
    select * into v_txn from inv_stock_transactions where id = p_txn_id and status = 'pending_approval' for update;
    if not found then raise exception 'ไม่พบรายการที่รออนุมัติ'; end if;
    if p_approve then
      update inv_stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;
      if v_txn.txn_type = 'adjustment_increase' then
        insert into inv_item_stock (item_id, branch_id, current_qty, updated_at)
        values (v_txn.item_id, v_txn.branch_id, v_txn.quantity_delta, now())
        on conflict (item_id, branch_id) do update
          set current_qty = inv_item_stock.current_qty + v_txn.quantity_delta, updated_at = now();
      else
        update inv_item_stock set current_qty = greatest(0, current_qty + v_txn.quantity_delta), updated_at = now()
          where item_id = v_txn.item_id and branch_id = v_txn.branch_id;
      end if;
    else
      update inv_stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
    end if;
  end;
  $fn$;

  create or replace function public.fn_apply_floor()
  returns trigger language plpgsql as $fn$
  begin
    if new.status = 'approved' then
      update public.inv_item_stock
        set current_qty = greatest(0, current_qty + new.quantity_delta)
        where item_id = new.item_id and branch_id = new.branch_id;
    end if;
    return new;
  end;
  $fn$;
  create trigger trg_apply_stock_transaction
  before insert on public.inv_stock_transactions
  for each row execute function public.fn_apply_floor();

  create table public.sc_sales (
    id bigint generated always as identity primary key,
    date date not null,
    tenant_id uuid not null,
    total_revenue numeric
  );
  create table public.sc_payments (
    id bigint generated always as identity primary key,
    sale_date date not null,
    received_date date not null,
    amount numeric,
    tenant_id uuid not null
  );
`);

async function qty() {
  const r = await db.query(
    `select current_qty from public.inv_item_stock where item_id = $1 and branch_id = $2`,
    [ITEM, BRANCH]
  );
  return Number(r.rows[0]?.current_qty);
}

console.log("\n[1] ก่อนแก้: เบิกเกินถูกปัดเหลือ 0");
await db.exec(`
  insert into public.inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta)
  values ('${ITEM}', '${BRANCH}', 'stock_out', 'approved', -5)
`);
check((await qty()) === 0, "ก่อนแก้ ยอดถูกปัดเป็น 0", `ก่อนแก้ ยอดเป็น ${await qty()}`);

await db.exec(`
  delete from public.inv_stock_transactions;
  update public.inv_item_stock set current_qty = 1
    where item_id = '${ITEM}' and branch_id = '${BRANCH}';
`);

console.log("\n[2] รัน 0044");
await db.exec(sql);
await db.exec(sql);
ok("รันซ้ำได้ (idempotent)");

console.log("\n[3] หลังแก้: เบิกเกินถูกปฏิเสธ");
{
  let threw = false;
  try {
    await db.exec(`
      insert into public.inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta)
      values ('${ITEM}', '${BRANCH}', 'stock_out', 'approved', -5)
    `);
  } catch (e) {
    threw = /สต๊อกไม่พอ/.test(String(e.message));
  }
  check(threw, "เบิกเกินถูกปฏิเสธที่ DB", "เบิกเกินยังผ่าน");
  check((await qty()) === 1, "ยอดคงเหลือไม่ขยับหลังถูกปฏิเสธ", `ยอดเหลือ ${await qty()}`);
}

console.log("\n[4] ของชิ้นสุดท้ายสำเร็จได้หนึ่งรายการ");
{
  await db.exec(`
    insert into public.inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta)
    values ('${ITEM}', '${BRANCH}', 'stock_out', 'approved', -1)
  `);
  check((await qty()) === 0, "เบิกชิ้นสุดท้ายได้ เหลือ 0", `เหลือ ${await qty()}`);
  let threw = false;
  try {
    await db.exec(`
      insert into public.inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta)
      values ('${ITEM}', '${BRANCH}', 'stock_out', 'approved', -1)
    `);
  } catch (e) {
    threw = /สต๊อกไม่พอ/.test(String(e.message));
  }
  check(threw, "ครั้งที่สองของชิ้นสุดท้ายล้ม", "ครั้งที่สองยังผ่าน");
  check((await qty()) === 0, "ยอดยังเป็น 0 หลังครั้งที่สองล้ม", `เหลือ ${await qty()}`);
}

console.log("\n[5] อนุมัติปรับลดเกินถูกปฏิเสธ");
{
  await db.exec(`update public.inv_item_stock set current_qty = 2 where item_id = '${ITEM}' and branch_id = '${BRANCH}'`);
  const pendingId = "40000000-0000-0000-0000-000000000044";
  await db.exec(`
    insert into public.inv_stock_transactions (id, item_id, branch_id, txn_type, status, quantity_delta)
    values ('${pendingId}', '${ITEM}', '${BRANCH}', 'adjustment_decrease', 'pending_approval', -9)
  `);
  let threw = false;
  try {
    await db.query(`select public.inv_fn_approve_adjustment($1, true)`, [pendingId]);
  } catch (e) {
    threw = /สต๊อกไม่พอ/.test(String(e.message));
  }
  check(threw, "อนุมัติปรับลดเกินถูกปฏิเสธ", "อนุมัติปรับลดเกินยังผ่าน");
  check((await qty()) === 2, "ยอดไม่ขยับหลังอนุมัติล้ม", `เหลือ ${await qty()}`);
}

console.log("\n[6] client_request_id ไม่ซ้ำใน tenant");
{
  await db.exec(`
    insert into public.sc_sales (date, tenant_id, total_revenue, client_request_id)
    values ('2026-09-19', '${T1}', 100, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
  `);
  let threw = false;
  try {
    await db.exec(`
      insert into public.sc_sales (date, tenant_id, total_revenue, client_request_id)
      values ('2026-09-19', '${T1}', 100, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')
    `);
  } catch (e) {
    threw = /duplicate key|unique/i.test(String(e.message));
  }
  check(threw, "ขายซ้ำด้วย request เดิมถูกปฏิเสธ", "ยัง insert ขายซ้ำได้");

  await db.exec(`
    insert into public.sc_payments (sale_date, received_date, amount, tenant_id, client_request_id)
    values ('2026-09-19', '2026-09-19', 50, '${T1}', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
  `);
  let payThrew = false;
  try {
    await db.exec(`
      insert into public.sc_payments (sale_date, received_date, amount, tenant_id, client_request_id)
      values ('2026-09-19', '2026-09-19', 50, '${T1}', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')
    `);
  } catch (e) {
    payThrew = /duplicate key|unique/i.test(String(e.message));
  }
  check(payThrew, "รับชำระซ้ำด้วย request เดิมถูกปฏิเสธ", "ยัง insert รับชำระซ้ำได้");
}

console.log("\n[7] rollback คืนพฤติกรรมเดิม");
await db.exec(rollback);
await db.exec(`
  delete from public.inv_stock_transactions;
  update public.inv_item_stock set current_qty = 1
    where item_id = '${ITEM}' and branch_id = '${BRANCH}';
  insert into public.inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta)
  values ('${ITEM}', '${BRANCH}', 'stock_out', 'approved', -5)
`);
check((await qty()) === 0, "rollback แล้วเบิกเกินถูกปัดเป็น 0 อีกครั้ง", `rollback แล้วยอดเป็น ${await qty()}`);

const { rows: cols } = await db.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'sc_sales' and column_name = 'client_request_id'
`);
check(cols.length === 0, "rollback ลบ client_request_id", "rollback ยังเหลือ client_request_id");

await db.close();
if (failures) {
  console.log(`\n[0044] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[0044] ผ่านทั้งหมด");
}
