#!/usr/bin/env node
/**
 * เทสต์กันเบิกเกินเมื่อสองคำสั่งตัดสต๊อกพร้อมกัน (qty = 1, ต่างคนขอ -1)
 *
 * PGlite เป็นเอนจินเดียว คิวคำสั่งภายใน — ไม่ใช่สอง session ของ Postgres จริง
 * แต่แต่ละ INSERT ยังรัน trigger `FOR UPDATE` คนละรอบ รอบหลังต้องเห็นยอดหลังรอบแรก
 * ถ้าสองคำสั่งผ่านทั้งคู่ แปลว่ากันเกินพัง
 *
 * รัน: npm run test:stock-concurrency
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0044_reject_overissue_and_idempotency.sql"), "utf8");

const T1 = "00000000-0000-0000-0000-000000000001";
const BRANCH = "10000000-0000-0000-0000-0000000000b1";
const ITEM = "30000000-0000-0000-0000-000000000001";
const ADMIN = "10000000-0000-0000-0000-000000000001";

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
function check(cond, yes, no) {
  if (cond) ok(yes);
  else bad(no);
}

function insertOut(qty) {
  return `
    insert into public.inv_stock_transactions (item_id, branch_id, txn_type, status, quantity_delta)
    values ('${ITEM}', '${BRANCH}', 'stock_out', 'approved', ${qty})
  `;
}

const db = new PGlite();
console.log("\n[stock-concurrency] สองคำสั่งตัดสต๊อกพร้อมกัน");

await db.exec(`
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid language sql stable as $$
    select '${ADMIN}'::uuid
  $$;
  create table public.tenants (id uuid primary key, name text not null);
  insert into public.tenants values ('${T1}', 'T1');
  create table public.profiles (
    id uuid primary key, role text not null, branch_id uuid, tenant_id uuid, is_active boolean not null default true
  );
  insert into public.profiles (id, role, branch_id, tenant_id)
  values ('${ADMIN}', 'admin', '${BRANCH}', '${T1}');
  create table public.inv_item_stock (
    item_id uuid not null, branch_id uuid not null, current_qty numeric not null default 0, updated_at timestamptz,
    primary key (item_id, branch_id)
  );
  insert into public.inv_item_stock (item_id, branch_id, current_qty)
  values ('${ITEM}', '${BRANCH}', 1);
  create table public.inv_stock_transactions (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null, branch_id uuid not null, txn_type text not null,
    status text not null default 'approved', quantity_delta numeric not null, approved_by uuid
  );
  create or replace function public.inv_fn_current_role() returns text language sql stable as $$ select 'admin'::text $$;
  create or replace function public.inv_fn_current_branch() returns uuid language sql stable as $$ select '${BRANCH}'::uuid $$;
  create or replace function public.inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
  returns void language plpgsql as $fn$ begin return; end; $fn$;
  create or replace function public.fn_apply_stock()
  returns trigger language plpgsql as $fn$
  begin
    if new.status = 'approved' then
      update public.inv_item_stock
        set current_qty = current_qty + new.quantity_delta
        where item_id = new.item_id and branch_id = new.branch_id;
    end if;
    return new;
  end;
  $fn$;
  create trigger trg_apply_stock_transaction
  after insert on public.inv_stock_transactions
  for each row execute function public.fn_apply_stock();
  create table public.sc_sales (
    id bigint generated always as identity primary key, date date not null, tenant_id uuid not null, total_revenue numeric
  );
  create table public.sc_payments (
    id bigint generated always as identity primary key, sale_date date not null, received_date date not null, amount numeric, tenant_id uuid not null
  );
`);

await db.exec(sql);

check(/for update/i.test(sql), "0044 ล็อกแถวสต๊อกด้วย FOR UPDATE", "0044 ไม่มี FOR UPDATE");

function errText(result) {
  const e = result.reason;
  return String(e?.message ?? e ?? "");
}

async function qty() {
  const r = await db.query(
    `select current_qty from public.inv_item_stock where item_id = $1 and branch_id = $2`,
    [ITEM, BRANCH]
  );
  return Number(r.rows[0]?.current_qty);
}

async function raceTwoOuts() {
  const results = await Promise.allSettled([db.exec(insertOut(-1)), db.exec(insertOut(-1))]);
  const unexpected = results.filter(
    (r) => r.status === "rejected" && !/สต๊อกไม่พอ/.test(errText(r))
  );
  for (const r of unexpected) {
    bad(`คำสั่งล้มด้วยข้อความอื่น: ${errText(r)}`);
  }
  return {
    ok: results.filter((r) => r.status === "fulfilled").length,
    rejected: results.filter((r) => r.status === "rejected" && /สต๊อกไม่พอ/.test(errText(r))).length,
  };
}

{
  const raced = await raceTwoOuts();
  check(raced.ok === 1, "ของเหลือ 1 ชิ้น สำเร็จได้แค่หนึ่งคำสั่ง", `สำเร็จ ${raced.ok} คำสั่ง`);
  check(raced.rejected === 1, "คำสั่งที่สองถูกปฏิเสธสต๊อกไม่พอ", `ปฏิเสธ ${raced.rejected} คำสั่ง`);
  check((await qty()) === 0, "ยอดสุดท้ายเป็น 0 ไม่ติดลบ", `เหลือ ${await qty()}`);
}

{
  await db.exec(`
    delete from public.inv_stock_transactions;
    update public.inv_item_stock set current_qty = 2
      where item_id = '${ITEM}' and branch_id = '${BRANCH}';
  `);
  const raced = await raceTwoOuts();
  check(raced.ok === 2, "ของเหลือ 2 ชิ้น สองคำสั่ง -1 ผ่านทั้งคู่", `สำเร็จ ${raced.ok} คำสั่ง`);
  check((await qty()) === 0, "ยอดหลังสองคำสั่งเป็น 0", `เหลือ ${await qty()}`);
}

await db.close();
if (failures) {
  console.log(`\n[stock-concurrency] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[stock-concurrency] ผ่านทั้งหมด");
}
