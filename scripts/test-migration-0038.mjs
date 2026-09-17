#!/usr/bin/env node
/**
 * รัน migration 0038 (super_admin อนุมัติ adjustment ได้) ใส่ Postgres จริงผ่าน PGlite
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. ก่อนแก้: super_admin อนุมัติไม่ได้ (จำลองพฤติกรรมเดิมของ production ก่อน apply)
 *   3. หลังแก้: super_admin อนุมัติได้ (ข้ามได้ทุก tenant — ไม่ใช่แค่ tenant ตัวเอง เพราะไม่มี
 *      tenant ของตัวเอง)
 *   4. admin ปกติยังอนุมัติได้เหมือนเดิม (ไม่ใช่แค่ super_admin ที่ทำได้)
 *   5. co-admin ยังถูกกันข้ามสาขาเหมือนเดิม (เงื่อนไขเดิมไม่เปลี่ยน)
 *   6. staff ยังอนุมัติไม่ได้เหมือนเดิม
 *   7. rollback คืนพฤติกรรมเดิม (super_admin อนุมัติไม่ได้อีกครั้ง)
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0038 = fs.readFileSync(
  path.join(root, "supabase/migrations/0038_approve_adjustment_super_admin.sql"),
  "utf8"
);
const rollback0038 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0038_rollback.sql"), "utf8");

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
async function shouldSucceed(label, sql) {
  try {
    await db.exec(sql);
    ok(label);
  } catch (e) {
    bad(`${label}\n     ${e.message}`);
  }
}

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const BRANCH_1 = "10000000-0000-0000-0000-0000000000b1";
const BRANCH_2 = "20000000-0000-0000-0000-0000000000b2";
const U_ADMIN = "10000000-0000-0000-0000-000000000001";
const U_COADMIN_1 = "10000000-0000-0000-0000-000000000002"; // co-admin ของสาขา 1
const U_STAFF = "10000000-0000-0000-0000-000000000003";
const U_SUPER = "90000000-0000-0000-0000-000000000009";
const ITEM_1 = "30000000-0000-0000-0000-000000000001";

async function actAs(uid) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('test.uid', $1, false)`, [uid]);
}
async function actAsOwner() {
  await db.exec(`reset role`);
}

/** สร้าง pending adjustment ใหม่ 1 แถว (ใช้ owner เพื่อไม่ให้ RLS/สิทธิ์ปนกับสิ่งที่กำลังทดสอบ) */
async function seedPendingTxn(id, branchId) {
  await actAsOwner();
  await db.query(
    `insert into inv_stock_transactions (id, item_id, branch_id, txn_type, status, quantity_delta)
     values ($1, $2, $3, 'adjustment_increase', 'pending_approval', 5)`,
    [id, ITEM_1, branchId]
  );
}
async function txnStatus(id) {
  await actAsOwner();
  const r = await db.query(`select status from inv_stock_transactions where id = $1`, [id]);
  return r.rows[0]?.status;
}

console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (2 tenant, RLS จริง, auth.uid() จำลอง — schema ก่อน 0038)");
await shouldSucceed(
  "สร้าง role/schema auth/ตารางที่เกี่ยวข้อง + ฟังก์ชันเดิมก่อน 0038 (จำลอง production)",
  `
  create role anon;
  create role authenticated;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$ language sql stable;

  create table tenants (id uuid primary key default gen_random_uuid(), name text not null);
  insert into tenants (id, name) values ('${T1}', 'SneakerCare'), ('${T2}', 'LUXSU');

  create table profiles (
    id uuid primary key,
    username text unique,
    role text not null default 'staff',
    branch_id uuid,
    tenant_id uuid references tenants(id),
    is_active boolean not null default true
  );
  insert into profiles (id, username, role, branch_id, tenant_id) values
    ('${U_ADMIN}', 'admin1', 'admin', null, '${T1}'),
    ('${U_COADMIN_1}', 'coadmin1', 'co-admin', '${BRANCH_1}', '${T1}'),
    ('${U_STAFF}', 'staff1', 'staff', '${BRANCH_1}', '${T1}'),
    ('${U_SUPER}', 'super', 'super_admin', null, null);

  create table inv_item_stock (
    item_id uuid not null,
    branch_id uuid not null,
    current_qty numeric not null default 0,
    updated_at timestamptz,
    primary key (item_id, branch_id)
  );
  insert into inv_item_stock (item_id, branch_id, current_qty) values
    ('${ITEM_1}', '${BRANCH_1}', 10), ('${ITEM_1}', '${BRANCH_2}', 10);

  create table inv_stock_transactions (
    id uuid primary key default gen_random_uuid(),
    item_id uuid not null,
    branch_id uuid not null,
    txn_type text not null,
    status text not null default 'approved',
    quantity_delta numeric not null,
    approved_by uuid
  );

  -- ฟังก์ชันจริงตามที่ตรวจกับ production ก่อน apply 0038
  create or replace function public.inv_fn_current_role() returns text
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select case lower(replace(coalesce(p.role, ''), '_', '-'))
      when 'admin' then 'admin' when 'co-admin' then 'co-admin' when 'staff' then 'staff'
      when 'super-admin' then 'super_admin' else null end
    from profiles p where p.id = auth.uid() and coalesce(p.is_active, true)
  $fn$;

  create or replace function public.inv_fn_current_branch() returns uuid
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select p.branch_id from profiles p where p.id = auth.uid() and coalesce(p.is_active, true)
  $fn$;

  -- นิยามเดิมของ inv_fn_approve_adjustment ก่อน 0038 (คัดลอกจาก prosrc จริงบน production)
  create or replace function public.inv_fn_approve_adjustment(p_txn_id uuid, p_approve boolean)
  returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $fn$
  declare
    v_txn inv_stock_transactions%rowtype;
  begin
    if inv_fn_current_role() not in ('admin', 'co-admin') then
      raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่อนุมัติการปรับปรุงสต๊อกได้';
    end if;
    select * into v_txn from inv_stock_transactions where id = p_txn_id and status = 'pending_approval' for update;
    if not found then raise exception 'ไม่พบรายการที่รออนุมัติ'; end if;
    if inv_fn_current_role() = 'co-admin' and v_txn.branch_id != inv_fn_current_branch() then
      raise exception 'ไม่มีสิทธิ์อนุมัติรายการของสาขาอื่น';
    end if;
    if p_approve then
      update inv_stock_transactions set status = 'approved', approved_by = auth.uid() where id = p_txn_id;
    else
      update inv_stock_transactions set status = 'rejected', approved_by = auth.uid() where id = p_txn_id;
    end if;
  end;
  $fn$;

  grant all on inv_item_stock, inv_stock_transactions, profiles, tenants to authenticated;
  `
);

console.log("\n[2] ก่อนแก้: super_admin อนุมัติไม่ได้ (พฤติกรรมเดิมของ production)");
{
  const id = "40000000-0000-0000-0000-000000000001";
  await seedPendingTxn(id, BRANCH_1);
  await actAs(U_SUPER);
  let threw = false;
  try {
    await db.query(`select inv_fn_approve_adjustment($1, true)`, [id]);
  } catch {
    threw = true;
  }
  check(threw, "super_admin โดนปฏิเสธก่อนแก้ (ตรงกับที่ production เป็นอยู่จริง)", "super_admin อนุมัติผ่านทั้งที่ยังไม่ได้แก้");
}

console.log("\n[3] รัน migration 0038");
await actAsOwner(); // ขั้น [2] จบด้วย actAs(U_SUPER) — ต้องกลับมาเป็นเจ้าของก่อนแก้ schema
await shouldSucceed("รันไฟล์ทั้งไฟล์", sql0038);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0038);

console.log("\n[4] หลังแก้: super_admin อนุมัติได้แล้ว ข้ามได้ทุกสาขา/tenant");
{
  const id = "40000000-0000-0000-0000-000000000002";
  await seedPendingTxn(id, BRANCH_2); // สาขาที่ super_admin ไม่มี branch_id ผูกอยู่เลย
  await actAs(U_SUPER);
  await shouldSucceed("super_admin อนุมัติ adjustment ของสาขาไหนก็ได้", `select inv_fn_approve_adjustment('${id}', true)`);
  const status = await txnStatus(id);
  check(status === "approved", "สถานะเปลี่ยนเป็น approved จริง", `ได้สถานะ ${status}`);
  const stockRow = await (async () => {
    await actAsOwner();
    const r = await db.query(`select current_qty from inv_item_stock where item_id = $1 and branch_id = $2`, [
      ITEM_1,
      BRANCH_2,
    ]);
    return r.rows[0]?.current_qty;
  })();
  check(Number(stockRow) === 15, "ยอดคงเหลือถูกอัปเดตจริงหลังอนุมัติ (10 + 5 = 15)", `ได้ ${stockRow}`);
}

console.log("\n[5] admin ปกติยังอนุมัติได้เหมือนเดิม (ไม่ใช่แค่ super_admin)");
{
  const id = "40000000-0000-0000-0000-000000000003";
  await seedPendingTxn(id, BRANCH_1);
  await actAs(U_ADMIN);
  await shouldSucceed("admin อนุมัติได้เหมือนเดิม", `select inv_fn_approve_adjustment('${id}', true)`);
}

console.log("\n[6] co-admin ยังถูกกันข้ามสาขาเหมือนเดิม (เงื่อนไขเดิมไม่เปลี่ยน)");
{
  const id = "40000000-0000-0000-0000-000000000004";
  await seedPendingTxn(id, BRANCH_2); // co-admin ผูกกับ BRANCH_1 อยู่ ไม่ใช่ BRANCH_2
  await actAs(U_COADMIN_1);
  let threw = false;
  try {
    await db.query(`select inv_fn_approve_adjustment($1, true)`, [id]);
  } catch (e) {
    threw = /ไม่มีสิทธิ์อนุมัติรายการของสาขาอื่น/.test(e.message);
  }
  check(threw, "co-admin อนุมัติข้ามสาขาตัวเองไม่ได้เหมือนเดิม", "co-admin อนุมัติข้ามสาขาผ่านทั้งที่ไม่ควรได้");
}

console.log("\n[7] staff ยังอนุมัติไม่ได้เหมือนเดิม");
{
  const id = "40000000-0000-0000-0000-000000000005";
  await seedPendingTxn(id, BRANCH_1);
  await actAs(U_STAFF);
  let threw = false;
  try {
    await db.query(`select inv_fn_approve_adjustment($1, true)`, [id]);
  } catch {
    threw = true;
  }
  check(threw, "staff อนุมัติไม่ได้เหมือนเดิม", "staff อนุมัติผ่านทั้งที่ไม่ควรได้");
}

console.log("\n[8] rollback คืนพฤติกรรมเดิม (super_admin อนุมัติไม่ได้อีกครั้ง)");
await actAsOwner(); // ขั้น [7] จบด้วย actAs(U_STAFF) — ต้องกลับมาเป็นเจ้าของก่อนแก้ schema
await shouldSucceed("รัน rollback ผ่าน", rollback0038);
{
  const id = "40000000-0000-0000-0000-000000000006";
  await seedPendingTxn(id, BRANCH_1);
  await actAs(U_SUPER);
  let threw = false;
  try {
    await db.query(`select inv_fn_approve_adjustment($1, true)`, [id]);
  } catch {
    threw = true;
  }
  check(threw, "หลัง rollback super_admin อนุมัติไม่ได้อีกครั้ง (คืนสภาพเดิมสำเร็จ)", "หลัง rollback super_admin ยังอนุมัติได้อยู่ — rollback ไม่สมบูรณ์");
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0038 ผ่านทุกข้อ — super_admin อนุมัติ adjustment ข้าม tenant ได้แล้ว, admin/co-admin/staff พฤติกรรมเดิมไม่เปลี่ยน, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
