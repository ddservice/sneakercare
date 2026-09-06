#!/usr/bin/env node
/**
 * รัน migration 0011 + 0012 ต่อกันใส่ Postgres จริง เพื่อพิสูจน์ว่า baseline ของตาราง sc_*
 * "สร้างระบบขึ้นมาจากศูนย์ได้จริง" ไม่ใช่แค่ SQL ที่อ่านแล้วดูถูก
 *
 * ทำไมต้องมี: ตาราง sc_* ถูกสร้างบน production นอกระบบ migration ตอนพัฒนาโมดูล POS/เงินเดือน
 * ใครกู้ระบบขึ้นโปรเจกต์ใหม่ด้วย supabase/migrations/ อย่างเดียวจะไม่ได้โมดูลการเงินเลย
 * 0012 ปิดช่องว่างนั้น — แต่ migration ที่ "กู้ระบบไม่ได้จริง" ก็ไร้ค่าเท่ากับไม่มี จึงต้องรันทดสอบ
 *
 * สิ่งที่ตรวจ:
 *   1. รัน 0011 → 0012 ต่อกันได้บนฐานข้อมูลเปล่า (ลำดับเดียวกับ `supabase start` / CI)
 *   2. รัน 0012 ซ้ำได้ (idempotent) — สำคัญเพราะไฟล์นี้ออกแบบให้ no-op บน production
 *   3. ได้ตาราง / index / policy / FK ครบตามฐานข้อมูลจริง
 *   4. เขียน-อ่านข้อมูลจริงผ่านตารางที่สร้างขึ้นได้
 *   5. FK ของ sc_users.branch_id เลือกตารางที่มีอยู่จริงได้ถูก (branches บน local, inv_branches บน prod)
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0011 = fs.readFileSync(
  path.join(root, "supabase/migrations/0011_sc_audit_logs_and_indexes.sql"),
  "utf8"
);
const sql0012 = fs.readFileSync(
  path.join(root, "supabase/migrations/0012_sc_tables_baseline.sql"),
  "utf8"
);

const db = new PGlite();
let failures = 0;

const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};

async function shouldSucceed(label, sql) {
  try {
    await db.exec(sql);
    ok(label);
  } catch (e) {
    bad(`${label}\n     ${e.message}`);
  }
}

// ── จำลองเฉพาะสิ่งที่ Supabase มีให้อยู่แล้ว (role, schema auth, ตารางฝั่งคลังสินค้า) ──
// ตั้งใจ "ไม่" สร้างตาราง sc_* ไว้ล่วงหน้า — ทั้งหมดต้องเกิดจาก migration 0012 เท่านั้น
// ไม่งั้นเทสต์จะผ่านได้โดยที่ migration ไม่ได้ทำอะไรเลย
console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (ไม่มีตาราง sc_* ใดๆ)");
await shouldSucceed(
  "สร้าง role / schema auth / auth.users / branches",
  `
  create role anon;
  create role authenticated;
  create schema if not exists auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid as $$ select null::uuid $$ language sql stable;

  create table profiles (
    id uuid primary key,
    role text not null default 'staff',
    display_name text
  );
  create table branches (id uuid primary key default gen_random_uuid(), name text);
  `
);

console.log("\n[2] รัน migration ตามลำดับเหมือน supabase start");
await shouldSucceed("0011 รันผ่าน (ข้าม index ของ sc_* เพราะตารางยังไม่มี)", sql0011);
await shouldSucceed("0012 รันผ่าน", sql0012);
await shouldSucceed("0012 รันซ้ำได้ (idempotent)", sql0012);

console.log("\n[3] ตารางที่ต้องเกิดขึ้น");
const expectedTables = [
  "sc_employees",
  "sc_expenses",
  "sc_opex",
  "sc_opex_history",
  "sc_payments",
  "sc_sales",
  "sc_settings",
  "sc_users",
];
const { rows: tbl } = await db.query(
  `select tablename from pg_tables where schemaname = 'public' and tablename like 'sc\\_%'`
);
const tableNames = new Set(tbl.map((r) => r.tablename));
for (const want of expectedTables) {
  if (tableNames.has(want)) ok(`มีตาราง ${want}`);
  else bad(`ไม่พบตาราง ${want}`);
}

console.log("\n[4] index ที่ 0011 ข้ามไปตอนตารางยังไม่มี ต้องถูกสร้างที่ 0012");
const expectedIndexes = [
  "idx_sc_sales_date",
  "idx_sc_payments_sale_date",
  "idx_sc_opex_month",
  "idx_sc_payments_received_date",
  "idx_opex_history_month",
];
const { rows: idx } = await db.query(
  `select indexname from pg_indexes where schemaname = 'public'`
);
const indexNames = new Set(idx.map((r) => r.indexname));
for (const want of expectedIndexes) {
  if (indexNames.has(want)) ok(`มี index ${want}`);
  else bad(`ไม่พบ index ${want}`);
}

console.log("\n[5] RLS เปิดครบทุกตาราง และ policy ไม่ซ้ำหลังรันซ้ำ");
const { rows: rls } = await db.query(
  `select relname, relrowsecurity from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and relname like 'sc\\_%' and relkind = 'r'`
);
const noRls = rls.filter((r) => !r.relrowsecurity).map((r) => r.relname);
if (noRls.length === 0) ok(`RLS เปิดครบ ${rls.length} ตาราง`);
else bad(`RLS ยังไม่เปิดที่: ${noRls.join(", ")}`);

const { rows: pol } = await db.query(
  `select tablename, policyname, count(*)::int as n from pg_policies
   where schemaname = 'public' and tablename like 'sc\\_%'
   group by 1, 2 having count(*) > 1`
);
if (pol.length === 0) ok("ไม่มี policy ซ้ำหลังรัน migration สองรอบ");
else bad(`พบ policy ซ้ำ: ${JSON.stringify(pol)}`);

const { rows: polCount } = await db.query(
  `select count(*)::int as n from pg_policies where schemaname = 'public' and tablename like 'sc\\_%'`
);
// 21 policy ของ 0012 + 1 policy อ่าน sc_audit_logs ของ 0011
if (polCount[0].n === 22) ok(`มี policy ครบ ${polCount[0].n} ข้อ`);
else bad(`policy มี ${polCount[0].n} ข้อ (คาดไว้ 22)`);

// sc_expenses ตั้งใจให้ไม่มี policy เลย (เข้าถึงได้เฉพาะ service_role) — ตรงกับ production
const { rows: expPol } = await db.query(
  `select count(*)::int as n from pg_policies where tablename = 'sc_expenses'`
);
if (expPol[0].n === 0) ok("sc_expenses ไม่มี policy ตามที่ตั้งใจ (ล็อกไว้เฉพาะ service_role)");
else bad(`sc_expenses มี policy ${expPol[0].n} ข้อ ซึ่งไม่ตรงกับ production`);

console.log("\n[6] FK / constraint");
const { rows: fk } = await db.query(
  `select conname, confrelid::regclass::text as target from pg_constraint
   where conname in ('sc_users_branch_id_fkey', 'sc_users_user_id_fkey', 'sc_opex_month_key_unique')`
);
const byName = Object.fromEntries(fk.map((r) => [r.conname, r.target]));
if (byName["sc_users_branch_id_fkey"] === "branches")
  ok("sc_users.branch_id ผูกกับ branches ที่มีอยู่จริงในฐานข้อมูลนี้");
else bad(`sc_users_branch_id_fkey ชี้ไป ${byName["sc_users_branch_id_fkey"] ?? "ไม่มี"} (คาดไว้ branches)`);
if (byName["sc_opex_month_key_unique"]) ok("sc_opex มี unique (month, key)");
else bad("ไม่พบ constraint sc_opex_month_key_unique");

console.log("\n[7] ใช้งานจริงได้ (เขียน/อ่าน/กันข้อมูลซ้ำ)");
await shouldSucceed(
  "บันทึกยอดขาย + รับชำระ + ค่าใช้จ่ายรายเดือน",
  `insert into sc_sales ("date", grand_total, cash_amount) values ('2026-09-06', 4200, 4200);
   insert into sc_payments (sale_date, amount, pay_method) values ('2026-09-06', 1000, 'transfer');
   insert into sc_opex (month, category, key, name, amount)
     values ('09/2026', 'ค่าเช่า', 'rent', 'ค่าเช่าร้าน', 18000);`
);
try {
  await db.exec(
    `insert into sc_opex (month, key, amount) values ('09/2026', 'rent', 999)`
  );
  bad("ยอมให้มี key ซ้ำในเดือนเดียวกัน — unique constraint ไม่ทำงาน");
} catch {
  ok("กันการบันทึก key ซ้ำในเดือนเดียวกันได้ (unique month+key)");
}
try {
  await db.exec(`insert into sc_sales ("date", grand_total) values ('2026-09-06', 1)`);
  bad("ยอมให้มียอดขายสองแถวในวันเดียวกัน — unique(date) ไม่ทำงาน");
} catch {
  ok("กันยอดขายซ้ำวันเดียวกันได้ (unique date)");
}

const { rows: sales } = await db.query(`select count(*)::int as n from sc_sales`);
if (sales[0].n === 1) ok("ข้อมูลที่บันทึกอ่านกลับมาได้ถูกต้อง");
else bad(`sc_sales มี ${sales[0].n} แถว (คาดไว้ 1)`);

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด" : `\n❌ ไม่ผ่าน ${failures} ข้อ`);
// ต้องปิด PGlite ก่อนจบโปรเซส: ถ้าเรียก process.exit() ทั้งที่ worker ของมันยังเปิดอยู่ libuv
// จะ abort ด้วย "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" แล้วคืน exit code 127
// ออกมา — เทสต์ผ่านหมดทุกข้อแต่ npm/CI อ่านว่า "ล้มเหลว" (เจอจริง 2026-09-06 บน Node 24 / Windows)
await db.close();
process.exitCode = failures === 0 ? 0 : 1;
