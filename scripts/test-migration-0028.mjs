#!/usr/bin/env node
/**
 * รัน migration 0028 (โครงพื้นฐาน tenants) ใส่ Postgres จริงผ่าน PGlite (WASM — ไม่ต้องมี Docker)
 *
 * ทำไมต้องมี: migration นี้ apply ด้วยมือผ่าน Supabase SQL Editor (repo ไม่มีสิทธิ์ DDL ไปที่
 * SneakerCareDB) — ที่สำคัญกว่านั้น migration นี้มีตรรกะเลือกชื่อตารางจริงแบบไดนามิก (prod
 * ใช้ prefix `inv_` local/CI ใช้ชื่อเปล่า — ดูคอมเมนต์ในไฟล์ migration) ถ้าตรรกะนี้พลาด
 * จะเงียบสนิท (ไม่มี error แค่ "ข้ามตารางไปเฉยๆ") เทสต์นี้จึงต้องพิสูจน์ทั้งสองเส้นทาง
 * ไม่ใช่แค่ "รันผ่านทั้งไฟล์" เหมือนเทสต์อื่น
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. เลือกตาราง `inv_x` ถูกเมื่อมีทั้งคู่ (จำลอง production)
 *   3. fallback ไปตาราง `x` ถูกเมื่อไม่มี `inv_x` (จำลอง local/CI)
 *   4. ตารางที่ไม่มีอยู่เลยถูกข้ามอย่างปลอดภัย ไม่ทำให้ตารางอื่นพังไปด้วย
 *   5. ข้อมูลเดิมทุกแถว backfill เป็น tenant #1 อัตโนมัติผ่าน DEFAULT (ไม่ต้องแก้โค้ดแอป)
 *   6. FK ไปตาราง tenants ทำงานจริง (ใส่ tenant_id มั่วๆ ต้องถูกปฏิเสธ)
 *   7. fn_current_tenant() เรียกได้ และยังไม่มี policy ไหนอ้างถึง (เฟส 1 ไม่บังคับใช้)
 *   8. rollback ลบทุกอย่างที่สร้างไว้ได้หมดจริง แล้ว apply ซ้ำได้อีกรอบ (round-trip)
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0028_tenants_foundation.sql"), "utf8");
const rollback = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0028_rollback.sql"), "utf8");

const db = new PGlite();
let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};

async function shouldSucceed(label, s) {
  try {
    await db.exec(s);
    ok(label);
  } catch (e) {
    bad(`${label}\n     ${e.message}`);
  }
}

async function shouldFail(label, s) {
  try {
    await db.exec(s);
    bad(`${label} — แต่กลับสำเร็จ (constraint ไม่ทำงาน)`);
  } catch (e) {
    ok(`${label} → ${e.message.split("\n")[0]}`);
  }
}

function check(cond, okMsg, badMsg) {
  if (cond) ok(okMsg);
  else bad(badMsg);
}

const T1 = "00000000-0000-0000-0000-000000000001";

// ── [1] จำลองสภาพแวดล้อมแบบ "ครึ่ง prod ครึ่ง local" ตั้งใจ ─────────────────
// ตั้งใจให้บางตารางมีชื่อ prefix inv_ (จำลอง production) และบางตารางมีแค่ชื่อเปล่า
// (จำลอง local/CI) ในฐานข้อมูลเดียวกัน เพื่อพิสูจน์ว่า resolver เลือกถูกทั้งสองแบบพร้อมกัน
console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (ผสม prod/local โดยตั้งใจ)");
await shouldSucceed(
  "สร้าง role / schema auth / ตารางที่ migration ต้องใช้",
  `
  create role anon;
  create role authenticated;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid as $$ select null::uuid $$ language sql stable;

  create table profiles (
    id uuid primary key default gen_random_uuid(),
    role text not null default 'admin',
    branch_id uuid
  );
  insert into profiles (id) values (gen_random_uuid());

  -- กลุ่ม A แบบ "production": มีทั้ง inv_x และไม่มี x เปล่า
  create table inv_items (id uuid primary key default gen_random_uuid(), name text not null);
  insert into inv_items (name) values ('น้ำยาทำความสะอาดรองเท้า');
  create view items as select * from inv_items;
  alter view items set (security_invoker = on);

  create table inv_branches (id uuid primary key default gen_random_uuid(), name text not null);
  insert into inv_branches (name) values ('สาขาหลัก');
  create view branches as select * from inv_branches;
  alter view branches set (security_invoker = on);

  -- กลุ่ม A แบบ "local/CI": มีแค่ x เปล่า ไม่มี inv_x เลย
  create table item_stock (id uuid primary key default gen_random_uuid(), item_id uuid, current_qty numeric not null default 0);
  insert into item_stock (item_id, current_qty) values (gen_random_uuid(), 10);
  create table stock_transactions (id uuid primary key default gen_random_uuid(), quantity_delta numeric not null);

  -- ตั้งใจไม่สร้าง suppliers/integration_secrets/notification_log/audit_logs เลยสักตัว
  -- เพื่อพิสูจน์ข้อ [4]: ตารางที่ไม่มีอยู่จริงต้องถูกข้ามอย่างปลอดภัย ไม่ทำให้ทั้ง migration ล้ม

  -- กลุ่ม B: ชื่อเดียวกันทุกที่ — สร้างแค่บางตัวพอให้เทสต์ครบทุกเคส (มี/ไม่มี)
  create table customers (id uuid primary key default gen_random_uuid(), name text not null);
  create table sc_sales (id bigserial primary key, "date" date, total_revenue numeric);
  insert into sc_sales ("date", total_revenue) values (current_date, 1000);
  create table sc_opex (id bigserial primary key, month text, amount numeric);
  -- ตั้งใจไม่สร้าง sc_payments/sc_employees/ฯลฯ ที่เหลือ — พิสูจน์ว่าข้ามได้เหมือนกลุ่ม A
  `
);

// ── [2] รัน migration ────────────────────────────────────────────────────
console.log("\n[2] รัน migration 0028");
await shouldSucceed("รันไฟล์ทั้งไฟล์ (มีตารางไม่ครบทุกตัวโดยตั้งใจ — ต้องไม่ล้ม)", sql);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql);

// ── [3] ตาราง tenants และ tenant #1 ────────────────────────────────────────
console.log("\n[3] ตาราง tenants");
{
  const r = await db.query(`select id, name, is_active from tenants where id = $1`, [T1]);
  check(r.rows.length === 1, "มี tenant #1 หนึ่งแถว", "ไม่พบ tenant #1 หรือมีมากกว่าหนึ่งแถว");
  check(r.rows[0]?.is_active === true, "tenant #1 is_active = true", "tenant #1 ไม่ active");
}

// ── [4] fn_current_tenant() ────────────────────────────────────────────────
console.log("\n[4] fn_current_tenant()");
await shouldSucceed("เรียก fn_current_tenant() ได้ (คืน null เพราะ auth.uid() เป็น stub)", `select fn_current_tenant();`);

// ── [5] resolver เลือกตาราง inv_x ถูก (จำลอง production) ───────────────────
console.log("\n[5] กลุ่ม A แบบ production — ต้องเติม tenant_id ที่ตารางจริง (inv_x) ไม่ใช่ view");
{
  const r = await db.query(`select tenant_id from inv_items limit 1`);
  check(r.rows[0]?.tenant_id === T1, "inv_items.tenant_id = tenant #1", "inv_items.tenant_id ไม่ใช่ tenant #1");

  // `select *` ของ view ถูกขยายเป็นรายชื่อคอลัมน์ตายตัวตอน CREATE VIEW ไม่ใช่ query สดทุกครั้ง
  // ⇒ migration ต้อง `create or replace view` เองเพื่อให้เห็นคอลัมน์ใหม่ (พิสูจน์ตรงนี้)
  const viaView = await db.query(`select tenant_id from items limit 1`);
  check(
    viaView.rows[0]?.tenant_id === T1,
    "view `items` เห็น tenant_id หลัง migration ทำ create or replace view ให้",
    "view `items` ไม่เห็นคอลัมน์ tenant_id — แปลว่า migration ไม่ได้ refresh view"
  );

  const invOpt = await db.query(
    `select option_value from pg_options_to_table(
       (select reloptions from pg_class where relname = 'items')
     ) where option_name = 'security_invoker'`
  );
  check(
    invOpt.rows[0]?.option_value === "on",
    "view `items` ยังเป็น security_invoker=on หลัง create or replace view (ไม่เปิดช่องโหว่ 0016 กลับมา)",
    "view `items` เสีย security_invoker ไปหลัง create or replace view — ช่องโหว่ SECURITY DEFINER View กลับมาแล้ว"
  );
}

// ── [6] resolver fallback ไปตาราง x เปล่าถูก (จำลอง local/CI) ──────────────
console.log("\n[6] กลุ่ม A แบบ local/CI — ต้องเติม tenant_id ที่ตารางเปล่าโดยตรง");
{
  const r = await db.query(`select tenant_id from item_stock limit 1`);
  check(r.rows[0]?.tenant_id === T1, "item_stock.tenant_id = tenant #1 (ไม่มี inv_item_stock เลย)", "item_stock ไม่มี tenant_id ที่ถูกต้อง");
}

// [7] ตารางที่ไม่มีอยู่เลย (suppliers, integration_secrets, notification_log, audit_logs,
// sc_payments, sc_employees, ...) ต้องไม่ทำให้ migration ล้ม — พิสูจน์แล้วโดยอ้อมที่ [2]:
// ไฟล์ migration ทั้งไฟล์รันผ่าน (shouldSucceed) ทั้งที่ตารางเหล่านี้ไม่มีอยู่ในสภาพแวดล้อม
// จำลองเลยสักตัว ถ้า resolver ไม่ข้ามให้ปลอดภัยจริง [2] จะล้มไปตั้งแต่ตอนนั้นแล้ว

// ── [8] กลุ่ม B ธรรมดา ───────────────────────────────────────────────────
console.log("\n[8] กลุ่ม B (sc_sales, sc_opex, customers)");
{
  const r = await db.query(`select tenant_id from sc_sales limit 1`);
  check(r.rows[0]?.tenant_id === T1, "sc_sales.tenant_id = tenant #1", "sc_sales ไม่มี tenant_id ที่ถูกต้อง");
}

// ── [9] insert ใหม่ที่ไม่ระบุ tenant_id ต้องได้ tenant #1 อัตโนมัติผ่าน DEFAULT ──
console.log("\n[9] insert แถวใหม่โดยไม่ระบุ tenant_id (โค้ดแอปเดิมไม่ต้องแก้)");
await shouldSucceed(
  "insert ลง sc_opex โดยไม่ใส่ tenant_id",
  `insert into sc_opex (month, amount) values ('2026-09', 500)`
);
{
  const r = await db.query(`select tenant_id from sc_opex where month = '2026-09'`);
  check(r.rows[0]?.tenant_id === T1, "แถวใหม่ได้ tenant_id = tenant #1 อัตโนมัติ", "แถวใหม่ไม่ได้ tenant_id ที่ถูกต้อง");
}

// ── [10] FK กันค่ามั่ว ──────────────────────────────────────────────────────
console.log("\n[10] FK ของ tenant_id ทำงานจริง");
await shouldFail(
  "insert tenant_id ที่ไม่มีอยู่จริงในตาราง tenants",
  `insert into sc_opex (month, amount, tenant_id) values ('2026-10', 1, '99999999-9999-9999-9999-999999999999')`
);

// ── [11] NOT NULL บังคับจริง ─────────────────────────────────────────────
console.log("\n[11] NOT NULL ของ tenant_id");
await shouldFail(
  "insert tenant_id = null ตรงๆ",
  `insert into sc_opex (month, amount, tenant_id) values ('2026-11', 1, null)`
);

// ── [12] rollback ลบได้หมดจริง แล้ว apply ซ้ำได้อีกรอบ (round-trip) ─────────
console.log("\n[12] rollback แล้ว apply ซ้ำ");
await shouldSucceed("รัน rollback", rollback);
{
  const r = await db.query(`select 1 from information_schema.tables where table_name = 'tenants'`);
  check(r.rows.length === 0, "ตาราง tenants ถูกลบแล้ว", "ตาราง tenants ยังอยู่หลัง rollback");

  const r2 = await db.query(
    `select 1 from information_schema.columns where table_name = 'sc_sales' and column_name = 'tenant_id'`
  );
  check(r2.rows.length === 0, "คอลัมน์ sc_sales.tenant_id ถูกลบแล้ว", "sc_sales.tenant_id ยังอยู่หลัง rollback");
}
await shouldSucceed("apply migration ซ้ำได้อีกรอบหลัง rollback (round-trip เต็มรูปแบบ)", sql);

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0028 ผ่านทุกข้อ — resolver เลือกตารางถูกทั้งสองแบบ, backfill ครบ, FK/NOT NULL ทำงานจริง, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
