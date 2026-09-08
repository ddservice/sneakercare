#!/usr/bin/env node
/**
 * รัน migration 0024 ใส่ Postgres จริง (PGlite/WASM — ไม่ต้องมี Docker)
 *
 * ทำไมต้องมี: migration กลุ่มนี้ต้อง apply ด้วยมือผ่าน Supabase SQL Editor (repo ไม่มีสิทธิ์ DDL
 * ไปที่ SneakerCareDB) ⇒ ถ้า SQL พิมพ์ผิดจะไปรู้ตอนเจ้าของ paste ลง production แล้ว
 * เทสต์นี้พิสูจน์ว่า "รันได้จริง · รันซ้ำได้ · constraint กันของผิดได้จริง" ก่อนถึงมือเจ้าของ
 *
 * สิ่งที่ตรวจ:
 *   1. รันบนฐานข้อมูลเปล่าได้ และรันซ้ำได้ (idempotent)
 *   2. ได้ตาราง / index / policy / RLS / FK ครบ
 *   3. constraint กัน "timestamp ในคอลัมน์เงิน" · ยอด 0 · ยอดติดลบ · ชื่อว่าง ได้จริง
 *   4. หมวดที่ไม่มีในตารางอ้างอิง insert ไม่ผ่าน (จบยุค category free-text)
 *   5. unique index กันบันทึกซ้ำจาก backfill และกันของคลังชิ้นเดียวผูกค่าใช้จ่ายสองแถว
 *   6. trigger updated_at ทำงาน
 *   7. rollback ลบของที่สร้างได้หมดจริง
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0024 = fs.readFileSync(path.join(root, "supabase/migrations/0024_sc_expense_entries.sql"), "utf8");
const rollback0024 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0024_rollback.sql"), "utf8");

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

/** ต้องล้มเหลวเท่านั้น — ใช้พิสูจน์ว่า constraint ทำงานจริง ไม่ใช่แค่เขียนไว้เฉยๆ */
async function shouldFail(label, sql) {
  try {
    await db.exec(sql);
    bad(`${label} — แต่กลับสำเร็จ (constraint ไม่ทำงาน)`);
  } catch {
    ok(label);
  }
}

/** ยืนยันเงื่อนไข — เขียนเป็นฟังก์ชันแทน ternary เพื่อไม่ให้ติด no-unused-expressions */
function check(cond, okMsg, badMsg) {
  if (cond) ok(okMsg);
  else bad(badMsg);
}

async function count(sql) {
  const { rows } = await db.query(sql);
  return Number(rows[0]?.n ?? 0);
}

// ── สภาพแวดล้อมจำลอง: เฉพาะสิ่งที่ Supabase/migration ก่อนหน้ามีให้อยู่แล้ว ──
console.log("\n[0024-1] เตรียมสภาพแวดล้อมจำลอง");
await shouldSucceed(
  "สร้าง role / profiles / inv_branches / inv_stock_transactions / sc_get_my_role()",
  `
  create role anon;
  create role authenticated;
  create table profiles (id uuid primary key, role text not null default 'staff');
  create table inv_branches (id uuid primary key default gen_random_uuid(), name text);
  create table inv_stock_transactions (id uuid primary key default gen_random_uuid(), total_cost numeric);
  create or replace function public.sc_get_my_role() returns text
    language sql stable as $fn$ select 'admin'::text $fn$;
  `
);

console.log("\n[0024-2] รัน migration 0024");
await shouldSucceed("รันครั้งแรกบนฐานข้อมูลเปล่า", sql0024);
await shouldSucceed("รันซ้ำได้ (idempotent)", sql0024);

console.log("\n[0024-3] โครงสร้างที่ต้องได้");
for (const t of ["sc_expense_categories", "sc_expense_entries"]) {
  const n = await count(`select count(*)::int as n from pg_tables where schemaname='public' and tablename='${t}'`);
  check(n === 1, `มีตาราง ${t}`, `ไม่มีตาราง ${t}`);
  const rls = await count(
    `select count(*)::int as n from pg_class where relname='${t}' and relrowsecurity = true`
  );
  check(rls === 1, `${t} เปิด RLS แล้ว`, `${t} ยังไม่เปิด RLS`);
}
const cats = await count(`select count(*)::int as n from sc_expense_categories`);
check(cats === 7, "seed หมวดค่าใช้จ่ายครบ 7 หมวด", `seed หมวดได้ ${cats} หมวด (คาดไว้ 7)`);

const policies = await count(
  `select count(*)::int as n from pg_policies where schemaname='public' and tablename='sc_expense_entries'`
);
check(policies === 4, "มี policy ครบ 4 ตัว (select/insert/update/delete)", `มี policy ${policies} ตัว (คาดไว้ 4)`);

for (const idx of [
  "sc_expense_entries_legacy_uidx",
  "sc_expense_entries_stock_txn_uidx",
  "sc_expense_entries_date_idx",
  "sc_expense_entries_category_idx",
  "sc_expense_entries_branch_idx",
]) {
  const n = await count(`select count(*)::int as n from pg_indexes where schemaname='public' and indexname='${idx}'`);
  check(n === 1, `มี index ${idx}`, `ไม่มี index ${idx}`);
}

console.log("\n[0024-4] constraint ต้องกันของผิดได้จริง");
await shouldSucceed(
  "บันทึกค่าใช้จ่ายปกติได้",
  `insert into sc_expense_entries (entry_date, amount, category, title)
   values ('2026-09-08', 1234.56, 'supplies_cogs', 'น้ำยาซักรองเท้า')`
);
await shouldFail(
  "กัน timestamp ในคอลัมน์เงิน (ระเบิดเวลาเดิมของ sc_opex)",
  `insert into sc_expense_entries (entry_date, amount, category, title)
   values ('2026-09-08', 1787827245489, 'supplies_cogs', 'audit_log')`
);
await shouldFail(
  "กันยอด 0",
  `insert into sc_expense_entries (entry_date, amount, category, title)
   values ('2026-09-08', 0, 'supplies_cogs', 'ของฟรี')`
);
await shouldFail(
  "กันยอดติดลบ",
  `insert into sc_expense_entries (entry_date, amount, category, title)
   values ('2026-09-08', -500, 'supplies_cogs', 'ติดลบ')`
);
await shouldFail(
  "กันชื่อรายการว่าง",
  `insert into sc_expense_entries (entry_date, amount, category, title)
   values ('2026-09-08', 100, 'supplies_cogs', '   ')`
);
await shouldFail(
  "กันหมวดที่ไม่มีในตารางอ้างอิง (จบยุค category free-text)",
  `insert into sc_expense_entries (entry_date, amount, category, title)
   values ('2026-09-08', 100, 'หมวดที่พิมพ์เอาเอง', 'ของ')`
);

console.log("\n[0024-5] unique index กันการนับซ้ำ");
await shouldSucceed(
  "บันทึกแถวที่อ้าง legacy_opex_id ได้",
  `insert into sc_expense_entries (entry_date, amount, category, title, legacy_opex_id)
   values ('2026-09-08', 100, 'admin_general', 'จาก sc_opex', 999)`
);
await shouldFail(
  "กัน backfill ซ้ำ (legacy_opex_id ซ้ำ)",
  `insert into sc_expense_entries (entry_date, amount, category, title, legacy_opex_id)
   values ('2026-09-08', 100, 'admin_general', 'จาก sc_opex อีกรอบ', 999)`
);
await shouldSucceed(
  "แถวที่ legacy_opex_id เป็น null ซ้ำกันได้ (partial unique)",
  `insert into sc_expense_entries (entry_date, amount, category, title) values ('2026-09-08', 1, 'admin_general', 'ก');
   insert into sc_expense_entries (entry_date, amount, category, title) values ('2026-09-08', 1, 'admin_general', 'ข')`
);
await shouldSucceed(
  "ผูกกับของที่รับเข้าคลังได้",
  `insert into inv_stock_transactions (id, total_cost) values ('11111111-1111-1111-1111-111111111111', 500);
   insert into sc_expense_entries (entry_date, amount, category, title, stock_txn_id)
   values ('2026-09-08', 500, 'supplies_cogs', 'ของเข้าคลัง', '11111111-1111-1111-1111-111111111111')`
);
await shouldFail(
  "กันของคลังชิ้นเดียวผูกค่าใช้จ่ายสองแถว",
  `insert into sc_expense_entries (entry_date, amount, category, title, stock_txn_id)
   values ('2026-09-08', 500, 'supplies_cogs', 'ซ้ำ', '11111111-1111-1111-1111-111111111111')`
);
await shouldFail(
  "กันการอ้างรายการคลังที่ไม่มีอยู่จริง (FK)",
  `insert into sc_expense_entries (entry_date, amount, category, title, stock_txn_id)
   values ('2026-09-08', 500, 'supplies_cogs', 'ไม่มีจริง', '22222222-2222-2222-2222-222222222222')`
);

console.log("\n[0024-6] trigger updated_at");
await db.exec(`update sc_expense_entries set amount = 2000 where legacy_opex_id = 999`);
const touched = await count(
  `select count(*)::int as n from sc_expense_entries where legacy_opex_id = 999 and updated_at > created_at`
);
check(touched === 1, "updated_at ขยับเองเมื่อแก้ไขแถว", "updated_at ไม่ขยับหลัง update");

console.log("\n[0024-7] rollback ต้องลบของที่สร้างได้หมด");
await shouldSucceed("รัน rollback ได้", rollback0024);
const leftover = await count(
  `select count(*)::int as n from pg_tables where schemaname='public'
   and tablename in ('sc_expense_entries','sc_expense_categories')`
);
check(leftover === 0, "ไม่เหลือตารางค้าง", `ยังเหลือ ${leftover} ตาราง`);

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด" : `\n❌ ไม่ผ่าน ${failures} ข้อ`);
// ต้องปิด PGlite ก่อนจบโปรเซส ไม่งั้น libuv abort แล้วคืน exit code 127 (ดูหมายเหตุใน 0012)
await db.close();
process.exitCode = failures === 0 ? 0 : 1;
