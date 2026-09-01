#!/usr/bin/env node
/**
 * รัน migration 0011 ใส่ Postgres จริงเพื่อพิสูจน์ว่า "รันได้" และ "กันการแก้ log ได้จริง"
 *
 * ทำไมต้องมี: migration นี้ apply ด้วยมือผ่าน Supabase SQL Editor (repo ไม่มีสิทธิ์ DDL
 * ไปที่ SneakerCareDB) ถ้า SQL พิมพ์ผิดจะไปรู้เอาตอนวางในหน้าเว็บ production ซึ่งช้าไป
 * สคริปต์นี้ใช้ PGlite (Postgres คอมไพล์เป็น WASM) จึงรันได้โดยไม่ต้องมี Docker
 * หรือ Postgres ติดตั้งบนเครื่อง
 *
 * สิ่งที่ตรวจ:
 *   1. ไฟล์ migration รันผ่านทั้งไฟล์
 *   2. รันซ้ำได้ (idempotent) — สำคัญเพราะคนมักวางรันซ้ำเวลาไม่แน่ใจ
 *   3. INSERT ได้
 *   4. UPDATE / DELETE / TRUNCATE ถูกปฏิเสธจริง (หัวใจของ append-only)
 *   5. CHECK constraint ของ action ทำงาน
 *   6. index และ policy ถูกสร้างครบ
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationFile = path.join(root, "supabase/migrations/0011_sc_audit_logs_and_indexes.sql");

const db = new PGlite();
let failures = 0;

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}
function bad(msg) {
  console.log(`  ✗ ${msg}`);
  failures++;
}

async function shouldSucceed(label, sql) {
  try {
    await db.exec(sql);
    ok(label);
  } catch (e) {
    bad(`${label}\n     ${e.message}`);
  }
}

async function shouldFail(label, sql) {
  try {
    await db.exec(sql);
    bad(`${label} — แต่กลับทำสำเร็จ ซึ่งแปลว่าเกราะกันไม่ทำงาน`);
  } catch (e) {
    ok(`${label} → ${e.message.split("\n")[0]}`);
  }
}

// ── จำลองสภาพแวดล้อม Supabase เท่าที่ migration ต้องใช้ ────────────────────
// PGlite เป็น Postgres เปล่าๆ ไม่มี role anon/authenticated, schema auth หรือตาราง
// ของโปรเจกต์ — สร้างขึ้นมาให้พอรันได้ ไม่ได้จำลอง RLS ของจริง
console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง");
await shouldSucceed(
  "สร้าง role / schema auth / ตารางที่ migration อ้างถึง",
  `
  create role anon;
  create role authenticated;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid as $$ select null::uuid $$ language sql stable;

  create table profiles (
    id uuid primary key,
    role text not null default 'staff',
    display_name text
  );
  create table sc_sales    (id bigserial primary key, "date" date, total_revenue numeric);
  create table sc_payments (id bigserial primary key, sale_date date, amount numeric);
  create table sc_opex     (id bigserial primary key, month text, amount numeric);
  `
);

// ── รัน migration ─────────────────────────────────────────────────────────
const sql = fs.readFileSync(migrationFile, "utf8");

console.log("\n[2] รัน migration");
await shouldSucceed("รันไฟล์ 0011 ทั้งไฟล์", sql);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql);

// ── พฤติกรรมของตาราง ──────────────────────────────────────────────────────
console.log("\n[3] เขียน log ได้");
await shouldSucceed(
  "INSERT หนึ่งแถว",
  `insert into sc_audit_logs (action, entity, entity_id, actor_name, detail)
   values ('DELETE', 'daily_sale', '305', 'แอดมิน', '{"total_revenue":4200}'::jsonb);`
);

console.log("\n[4] แก้/ลบ log ไม่ได้ (append-only)");
await shouldFail("UPDATE ถูกปฏิเสธ", "update sc_audit_logs set action = 'CREATE' where id = 1");
await shouldFail("DELETE ถูกปฏิเสธ", "delete from sc_audit_logs where id = 1");
await shouldFail("TRUNCATE ถูกปฏิเสธ", "truncate sc_audit_logs");

console.log("\n[5] CHECK constraint ของ action");
await shouldFail(
  "action นอกรายการที่อนุญาตถูกปฏิเสธ",
  "insert into sc_audit_logs (action, entity, actor_name) values ('DROP', 'x', 'y')"
);

console.log("\n[6] โครงสร้างที่ต้องมี");
const expectedIndexes = [
  "idx_sc_audit_logs_action",
  "idx_sc_audit_logs_created_at",
  "idx_sc_audit_logs_entity",
  "idx_sc_opex_month",
  "idx_sc_payments_sale_date",
  "idx_sc_sales_date",
];
const { rows: idx } = await db.query(
  `select indexname from pg_indexes where schemaname = 'public'`
);
const names = new Set(idx.map((r) => r.indexname));
for (const want of expectedIndexes) {
  if (names.has(want)) ok(`มี index ${want}`);
  else bad(`ไม่พบ index ${want}`);
}

const { rows: pol } = await db.query(
  `select policyname, cmd from pg_policies where tablename = 'sc_audit_logs'`
);
if (pol.length === 1 && pol[0].cmd === "SELECT") ok("มี RLS policy อ่านอย่างเดียวหนึ่งข้อ");
else bad(`policy ไม่ตรงที่คาด: ${JSON.stringify(pol)}`);

const { rows: cnt } = await db.query("select count(*)::int as n from sc_audit_logs");
if (cnt[0].n === 1) ok("แถวยังอยู่ครบ 1 แถวหลังพยายามลบทุกวิธี");
else bad(`เหลือ ${cnt[0].n} แถว (ต้องเป็น 1)`);

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด" : `\n❌ ไม่ผ่าน ${failures} ข้อ`);
process.exit(failures === 0 ? 0 : 1);
