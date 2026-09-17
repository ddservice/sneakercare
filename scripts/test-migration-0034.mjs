#!/usr/bin/env node
/**
 * รัน migration 0034 (เลิกให้ FK สำคัญชี้ไป sc_users — ชี้ profiles(id) แทน) ผ่าน PGlite
 *
 * เจอระหว่างทดสอบ 0033 กับ production จริง: บัญชีทดสอบใหม่ (ไม่มีแถวใน sc_users) เขียน
 * inv_integration_secrets ไม่ได้เลย เพราะ trigger เขียน audit log ชน FK ของ inv_audit_logs
 * ที่ยังชี้ไป sc_users(user_id) — ตรวจกับ production แล้วพบ FK แบบเดียวกันอีก 3 จุด
 * (inv_stock_transactions.performed_by/approved_by, ui_permissions.updated_by)
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. FK ทั้ง 4 จุดชี้ไป profiles(id) แล้ว ไม่ใช่ sc_users(user_id)
 *   3. inv_audit_logs ใช้ NOT VALID — แถวเก่าที่ไม่มีใน profiles (ตามกฎข้อ 1 ห้ามแก้/ลบ) ไม่ถูกแตะ
 *   4. หลัง 0034: insert แถวใหม่ด้วยบัญชีที่ "ไม่มี" ใน sc_users แต่ "มี" ใน profiles สำเร็จ
 *      (นี่คือประเด็นหลักที่ต้องแก้ — บัญชีที่เชิญใหม่ทุกคนไม่มีแถวใน sc_users)
 *   5. insert แถวใหม่ด้วย performed_by ที่ไม่มีใน profiles เลย ต้องถูกปฏิเสธ (constraint บังคับจริง
 *      กับแถวใหม่ ไม่ใช่ NOT VALID แล้วไม่ทำอะไรเลย)
 *   6. rollback คืนสภาพเดิมได้ (กรณีไม่มีแถวใหม่ที่ทำให้ย้อนไม่ได้)
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0034 = fs.readFileSync(path.join(root, "supabase/migrations/0034_retire_sc_users_fk_dependency.sql"), "utf8");
const rollback0034 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0034_rollback.sql"), "utf8");

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
async function shouldFail(label, sql) {
  try {
    await db.exec(sql);
    bad(`${label} — แต่กลับสำเร็จ (constraint ไม่ทำงาน)`);
  } catch (e) {
    ok(`${label} → ${e.message.split("\n")[0]}`);
  }
}

const LEGACY_USER = "10000000-0000-0000-0000-000000000001"; // มีทั้งใน sc_users และ profiles (เช่น admin เดิม)
const NEW_USER = "20000000-0000-0000-0000-000000000002"; // มีแค่ใน profiles (บัญชีเชิญใหม่หลัง 0023)
const GHOST_USER = "30000000-0000-0000-0000-000000000003"; // ไม่มีทั้งคู่ (ห้าม insert สำเร็จ)
const ORPHAN_AUDIT_USER = "40000000-0000-0000-0000-000000000004"; // แถว audit log เก่าที่ไม่มีทั้งคู่ (เช่น rlsverify35)

console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (schema ก่อน 0034 — FK ชี้ sc_users, มีแถว orphan เก่า)");
await shouldSucceed(
  "สร้างตาราง sc_users/profiles/inv_audit_logs/inv_stock_transactions/ui_permissions แบบก่อน 0034",
  `
  create table sc_users (user_id uuid primary key);
  insert into sc_users (user_id) values ('${LEGACY_USER}');

  create table profiles (id uuid primary key, username text);
  insert into profiles (id, username) values ('${LEGACY_USER}', 'admin'), ('${NEW_USER}', 'newstaff');

  create table inv_audit_logs (
    id bigserial primary key, table_name text, performed_by uuid references sc_users(user_id)
  );
  -- แถวเก่าจริงบน production (id 354/355 ตามที่ตรวจแล้ว) — performed_by ไม่มีใน sc_users เลยด้วยซ้ำ
  -- ต้องปิด FK ชั่วคราวเพื่อ seed แถวแบบนี้จำลองสภาพจริงก่อน 0034
  alter table inv_audit_logs disable trigger all;
  insert into inv_audit_logs (table_name, performed_by) values ('inv_item_stock', '${ORPHAN_AUDIT_USER}');
  alter table inv_audit_logs enable trigger all;

  create table inv_stock_transactions (
    id bigserial primary key, performed_by uuid references sc_users(user_id), approved_by uuid references sc_users(user_id)
  );
  create table ui_permissions (id bigserial primary key, updated_by uuid references sc_users(user_id));
  `
);

console.log("\n[2] รัน migration 0034");
await shouldSucceed("รันไฟล์ทั้งไฟล์", sql0034);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0034);

console.log("\n[3] FK ทั้ง 4 จุดชี้ไป profiles(id) แล้ว");
{
  const r = await db.query(`
    select conrelid::regclass::text as tbl, confrelid::regclass::text as target
    from pg_constraint
    where conname in (
      'inv_audit_logs_performed_by_profiles_fkey',
      'inv_stock_transactions_performed_by_profiles_fkey',
      'inv_stock_transactions_approved_by_profiles_fkey',
      'ui_permissions_updated_by_profiles_fkey'
    )
  `);
  check(
    r.rows.length === 4 && r.rows.every((row) => row.target === "profiles"),
    "ทั้ง 4 FK ชี้ไป profiles แล้วครบ",
    `ได้ ${JSON.stringify(r.rows)}`
  );
}

console.log("\n[4] แถว audit log เก่าที่เป็น orphan (ก่อน 0034) ไม่ถูกแตะเลย (กฎข้อ 1 — audit log ห้ามแก้)");
{
  const r = await db.query(`select performed_by from inv_audit_logs where table_name = 'inv_item_stock'`);
  check(
    r.rows[0]?.performed_by === ORPHAN_AUDIT_USER,
    "แถว orphan เก่ายังอยู่ครบ ไม่ถูกลบ/แก้ระหว่าง migration (NOT VALID ไม่ย้อนไปเช็ค/แก้แถวเก่า)",
    `ได้ ${JSON.stringify(r.rows)}`
  );
}

console.log("\n[5] หลัง 0034: บัญชีที่ไม่มีใน sc_users แต่มีใน profiles เขียนได้แล้ว (ประเด็นหลักที่ต้องแก้)");
await shouldSucceed(
  "insert inv_audit_logs ใหม่ด้วย NEW_USER (ไม่มีใน sc_users)",
  `insert into inv_audit_logs (table_name, performed_by) values ('inv_stock_transactions', '${NEW_USER}')`
);
await shouldSucceed(
  "insert inv_stock_transactions ใหม่ด้วย NEW_USER ทั้ง performed_by และ approved_by",
  `insert into inv_stock_transactions (performed_by, approved_by) values ('${NEW_USER}', '${NEW_USER}')`
);
await shouldSucceed(
  "insert ui_permissions ใหม่ด้วย NEW_USER",
  `insert into ui_permissions (updated_by) values ('${NEW_USER}')`
);

console.log("\n[6] แถวใหม่ที่ performed_by ไม่มีใน profiles เลย ต้องถูกปฏิเสธจริง (constraint ยังบังคับแถวใหม่)");
await shouldFail(
  "insert inv_audit_logs ใหม่ด้วย GHOST_USER (ไม่มีทั้งใน sc_users และ profiles)",
  `insert into inv_audit_logs (table_name, performed_by) values ('inv_item_stock', '${GHOST_USER}')`
);

console.log("\n[7] rollback คืนสภาพเดิม (ใช้ NOT VALID เหมือนกัน — ทนต่อแถว NEW_USER ที่ไม่มีใน sc_users ได้)");
await shouldSucceed("รัน rollback ผ่าน แม้มีแถวที่ performed_by ไม่มีใน sc_users อยู่ก็ตาม", rollback0034);
{
  const r = await db.query(`select conname from pg_constraint where conname = 'inv_audit_logs_performed_by_fkey'`);
  check(r.rows.length === 1, "FK เดิม (ชี้ sc_users) กลับมาแล้วหลัง rollback", "ไม่พบ FK เดิมหลัง rollback");
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0034 ผ่านทุกข้อ — บัญชีใหม่ที่ไม่มีแถวใน sc_users เขียน audit/stock-transaction/permission ได้แล้ว, แถวเก่าไม่ถูกแตะ, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
