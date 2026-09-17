#!/usr/bin/env node
/**
 * รัน migration 0033 (integration secret ต่อ tenant) ใส่ Postgres จริงผ่าน PGlite
 *
 * `inv_integration_secrets` ไม่เคยถูก track ใน migrations เลย (เหมือน `sc_*` ก่อน 0012 และ
 * `ext_documents.ref_parent_doc_id` ก่อน 0027) — เทสต์นี้จึงจำลองรูปร่างตารางให้ตรงกับที่ตรวจ
 * จาก production จริงก่อนเขียนไฟล์ (5 คอลัมน์: key, value, updated_by, updated_at, tenant_id)
 * แทนที่จะพึ่ง schema จาก migration อื่น
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. สอง tenant ตั้งค่า telegram_bot_token คนละค่าพร้อมกันได้แล้ว (ผ่าน RPC เขียนจริง
 *      ไม่ใช่ insert ตรง — ต้องยิง "ในฐานะ" ผู้ใช้จริงของแต่ละ tenant)
 *   3. tenant A อ่านสถานะ (fn_integration_secret_status / inv_fn_integration_secret_status)
 *      เห็นแค่ของตัวเอง ไม่เห็นของ tenant B
 *   4. staff เรียกทั้งสองฟังก์ชันไม่ได้ (บั๊กเดิมของ fn_integration_secret_status ที่ไม่เคย
 *      เช็คสิทธิ์เลย — ต้องพิสูจน์ว่าแก้แล้วจริง)
 *   5. super_admin (ไม่มี tenant ของตัวเอง) ตั้งค่าไม่ได้ ได้ข้อความ error ที่อ่านรู้เรื่อง
 *   6. rollback คืนสภาพเดิม (PK เดี่ยวที่ key, ฟังก์ชันไม่กรอง tenant) ได้จริง
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0033 = fs.readFileSync(path.join(root, "supabase/migrations/0033_integration_secrets_per_tenant.sql"), "utf8");
const rollback0033 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0033_rollback.sql"), "utf8");

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
const T2 = "00000000-0000-0000-0000-000000000002";
const U_ADMIN_1 = "10000000-0000-0000-0000-000000000001";
const U_ADMIN_2 = "20000000-0000-0000-0000-000000000002";
const U_STAFF_1 = "10000000-0000-0000-0000-000000000009";
const U_SUPER = "90000000-0000-0000-0000-000000000009";

async function actAs(uid) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('test.uid', $1, false)`, [uid ?? ""]);
}
async function actAsOwner() {
  await db.exec(`reset role`);
}
async function shouldSucceed(label, sql) {
  try {
    await db.exec(sql);
    ok(label);
  } catch (e) {
    bad(`${label}\n     ${e.message}`);
  }
}
async function shouldFail(label, fn) {
  try {
    await fn();
    bad(`${label} — แต่กลับสำเร็จ`);
  } catch (e) {
    ok(`${label} → ${e.message.split("\n")[0]}`);
  }
}

console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (ตาราง inv_integration_secrets แบบก่อน 0033 — PK เดี่ยว)");
await shouldSucceed(
  "สร้าง role/schema auth/tenants/profiles/inv_integration_secrets ก่อน 0033",
  `
  create role anon;
  create role authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$ language sql stable;

  create table tenants (id uuid primary key, name text not null);
  insert into tenants (id, name) values ('${T1}', 'SneakerCare'), ('${T2}', 'BagSpa');

  create table profiles (
    id uuid primary key, username text unique, role text not null,
    tenant_id uuid references tenants(id)
  );
  insert into profiles (id, username, role, tenant_id) values
    ('${U_ADMIN_1}', 'admin1', 'admin', '${T1}'),
    ('${U_ADMIN_2}', 'admin2', 'admin', '${T2}'),
    ('${U_STAFF_1}', 'staff1', 'staff', '${T1}'),
    ('${U_SUPER}', 'super', 'super_admin', null);

  create or replace function public.inv_fn_current_role() returns text
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select p.role from profiles p where p.id = auth.uid()
  $fn$;
  create or replace function public.fn_current_tenant() returns uuid
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select tenant_id from public.profiles where id = auth.uid()
  $fn$;

  -- sc_users จำลอง (ตารางเดิม/deprecated ที่ updated_by เคย FK ไปหาก่อน 0033 แก้)
  -- ตั้งใจให้ "ว่าง" เหมือน production จริง (ไม่มีใครเขียน sc_users อีกแล้วตั้งแต่ 0023)
  -- เพื่อให้เทสต์นี้จับบั๊กแบบเดียวกับที่เจอจริงได้: admin ที่ไม่มีแถวใน sc_users ตั้งค่าไม่ได้
  create table sc_users (user_id uuid primary key);

  -- รูปร่างตารางจริงบน production ก่อน 0033 (ตรวจด้วย psql ก่อนเขียนไฟล์นี้ — 5 คอลัมน์,
  -- updated_by FK ไป sc_users(user_id) ไม่ใช่ profiles — คือส่วนที่ 0033 ต้องแก้)
  create table inv_integration_secrets (
    key text primary key,
    value text not null,
    updated_by uuid references sc_users(user_id),
    updated_at timestamptz not null default now(),
    tenant_id uuid not null references tenants(id)
  );
  alter table inv_integration_secrets enable row level security; -- ตรวจแล้วว่า 0 policy บน prod จริง (deny-all)
  grant all on inv_integration_secrets to authenticated;

  create or replace function public.inv_fn_set_integration_secret(p_key text, p_value text)
  returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
  begin
    if inv_fn_current_role() not in ('admin', 'co-admin') then
      raise exception 'เฉพาะ Admin และ Co-Admin เท่านั้นที่ตั้งค่า integration secret ได้';
    end if;
    insert into inv_integration_secrets(key, value, updated_by, updated_at, tenant_id)
    values (p_key, p_value, auth.uid(), now(), '${T1}')
    on conflict (key) do update set value = p_value, updated_by = auth.uid(), updated_at = now();
  end; $$;
  create or replace function public.fn_integration_secret_status(p_key text)
  returns table(is_set boolean, value_suffix text, updated_at timestamptz)
  language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
  begin
    -- บั๊กเดิมจริงบน production: ไม่มีการเช็คสิทธิ์เลยตรงนี้
    return query select true, right(s.value, 4), s.updated_at from inv_integration_secrets s where s.key = p_key
    union all select false, null::text, null::timestamptz
    where not exists (select 1 from inv_integration_secrets where key = p_key) limit 1;
  end; $$;
  `
);

console.log("\n[2] รัน migration 0033");
await shouldSucceed("รันไฟล์ทั้งไฟล์", sql0033);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0033);
{
  const r = await db.query(`
    select confrelid::regclass::text as target from pg_constraint
    where conname = 'inv_integration_secrets_updated_by_profiles_fkey'
  `);
  check(
    r.rows[0]?.target === "profiles",
    "updated_by ย้าย FK จาก sc_users(user_id) ไปเป็น profiles(id) แล้ว",
    `ได้ ${JSON.stringify(r.rows)} — ยังไม่ได้แก้ หรือ แก้ผิดเป้าหมาย`
  );
}

console.log("\n[3] สอง tenant ตั้งค่า telegram_bot_token คนละค่าพร้อมกันได้แล้ว (ผ่าน RPC จริง)");
await actAs(U_ADMIN_1);
await shouldSucceed(
  "admin1 (T1) ตั้งค่า token ของตัวเอง",
  `select inv_fn_set_integration_secret('telegram_bot_token', 'TOKEN_T1_AAA')`
);
await actAs(U_ADMIN_2);
await shouldSucceed(
  "admin2 (T2) ตั้งค่า token ของตัวเอง (คนละค่าจาก T1)",
  `select inv_fn_set_integration_secret('telegram_bot_token', 'TOKEN_T2_BBB')`
);
{
  await actAsOwner();
  const r = await db.query(`select tenant_id, value from inv_integration_secrets where key = 'telegram_bot_token' order by tenant_id`);
  check(r.rows.length === 2, "มี 2 แถว telegram_bot_token คนละ tenant พร้อมกันในตารางเดียว", `ได้ ${r.rows.length} แถว`);
  check(
    r.rows[0]?.value === "TOKEN_T1_AAA" && r.rows[1]?.value === "TOKEN_T2_BBB",
    "ค่าของแต่ละ tenant ถูกต้องตรงกับที่ตั้งไว้ ไม่ปนกัน",
    `ได้ ${JSON.stringify(r.rows)}`
  );
}

console.log("\n[4] อ่านสถานะ — เห็นแค่ของ tenant ตัวเอง");
await actAs(U_ADMIN_1);
{
  const r = await db.query(`select * from fn_integration_secret_status('telegram_bot_token')`);
  check(
    r.rows[0]?.is_set === true && r.rows[0]?.value_suffix === "_AAA",
    "admin1 เห็นสถานะ token ของ T1 ถูกต้อง (4 ตัวท้าย '_AAA')",
    `ได้ ${JSON.stringify(r.rows[0])}`
  );
}
await actAs(U_ADMIN_2);
{
  const r = await db.query(`select * from inv_fn_integration_secret_status('telegram_bot_token')`);
  check(
    r.rows[0]?.is_set === true && r.rows[0]?.value_suffix === "_BBB",
    "admin2 เห็นสถานะ token ของ T2 ถูกต้อง (4 ตัวท้าย '_BBB') — ไม่ใช่ของ T1",
    `ได้ ${JSON.stringify(r.rows[0])}`
  );
}

console.log("\n[5] staff เรียกทั้งสองฟังก์ชันไม่ได้ (แก้บั๊กเดิมที่ fn_integration_secret_status ไม่เช็คสิทธิ์เลย)");
await actAs(U_STAFF_1);
await shouldFail("staff1 เรียก fn_integration_secret_status", async () => {
  await db.query(`select * from fn_integration_secret_status('telegram_bot_token')`);
});
await shouldFail("staff1 เรียก inv_fn_set_integration_secret", async () => {
  await db.query(`select inv_fn_set_integration_secret('telegram_bot_token', 'HACK')`);
});

console.log("\n[6] super_admin ไม่มี tenant ของตัวเอง — ตั้งค่าไม่ได้ ได้ error อ่านรู้เรื่อง");
await actAs(U_SUPER);
await shouldFail("super_admin ตั้งค่า integration secret", async () => {
  await db.query(`select inv_fn_set_integration_secret('telegram_bot_token', 'X')`);
});

console.log("\n[7] rollback คืนสภาพเดิม");
await actAsOwner();
await db.exec(`delete from inv_integration_secrets where tenant_id = '${T2}'`); // ล้าง key ที่จะชน PK เดี่ยวก่อน
// updated_by ของแถวที่เหลือ (T1) เป็นบัญชีที่ไม่มีแถวใน sc_users (ตามที่เป็นจริงบน production
// สำหรับทุกบัญชีที่เชิญเข้าระบบหลัง 0023) — ต้อง null ก่อน ไม่งั้น FK เดิมที่ rollback คืนกลับมา
// จะ validate ไม่ผ่าน ตรงกับคำเตือนที่เขียนไว้ในหัวไฟล์ rollback
await db.exec(`update inv_integration_secrets set updated_by = null`);
await shouldSucceed("รัน rollback ผ่าน (หลังลบแถวที่จะชน PK เดี่ยว + null updated_by ที่ไม่มีใน sc_users ออกก่อน)", rollback0033);
{
  const r = await db.query(`select conname from pg_constraint where conname = 'inv_integration_secrets_pkey'`);
  check(r.rows.length === 1, "PK เดี่ยว (key) กลับมาแล้วหลัง rollback", "ไม่พบ PK เดิมหลัง rollback");
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0033 ผ่านทุกข้อ — สอง tenant ตั้งค่า Telegram bot token แยกกันได้จริง, staff เรียกไม่ได้, super_admin ตั้งเองไม่ได้ (ไม่มี tenant), rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
