#!/usr/bin/env node
/**
 * รัน migration 0032 (sc_settings composite key) ใส่ Postgres จริงผ่าน PGlite
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. สอง tenant ตั้งค่า key ชื่อเดียวกัน (เช่น 'name') พร้อมกันได้แล้วจริง
 *   3. key ระดับแพลตฟอร์ม (tenant_id = null) ยังกันซ้ำได้ — insert ซ้ำ key เดิมด้วย
 *      tenant_id = null สองรอบต้องถูกปฏิเสธ (พิสูจน์ NULLS NOT DISTINCT ทำงานจริง ไม่ใช่
 *      UNIQUE ธรรมดาที่ปล่อยให้ NULL ซ้ำกันได้)
 *   4. backup_success_notify ถูกย้ายเป็น tenant_id = null อัตโนมัติหลัง migration
 *   5. rollback คืนสภาพเดิมได้ (กรณีไม่มี key ชนกัน)
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0032 = fs.readFileSync(path.join(root, "supabase/migrations/0032_sc_settings_composite_key.sql"), "utf8");
const rollback0032 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0032_rollback.sql"), "utf8");

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

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";

console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (sc_settings ก่อน 0032 — PK เดี่ยวที่ key)");
await shouldSucceed(
  "สร้างตาราง tenants + sc_settings แบบก่อน 0032",
  `
  create table tenants (id uuid primary key default gen_random_uuid());
  insert into tenants (id) values ('${T1}'), ('${T2}');
  create table sc_settings (
    key text primary key,
    value text,
    updated_at timestamptz,
    tenant_id uuid not null default '${T1}'::uuid references tenants(id)
  );
  insert into sc_settings (key, value, tenant_id) values
    ('name', 'ร้าน T1', '${T1}'),
    ('backup_success_notify', 'true', '${T1}');
  `
);

console.log("\n[2] รัน migration 0032");
await shouldSucceed("รันไฟล์ทั้งไฟล์", sql0032);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0032);

console.log("\n[3] สอง tenant ตั้งค่า key เดียวกันพร้อมกันได้แล้ว");
await shouldSucceed(
  "tenant 2 insert key 'name' ของตัวเอง (คนละแถวจาก tenant 1 แต่ key ชื่อเดียวกัน)",
  `insert into sc_settings (key, value, tenant_id) values ('name', 'ร้าน T2', '${T2}')`
);
{
  const r = await db.query(`select tenant_id, value from sc_settings where key = 'name' order by tenant_id`);
  check(
    r.rows.length === 2,
    "มี 2 แถว key='name' คนละ tenant พร้อมกันในตารางเดียว",
    `ควรมี 2 แถวแต่ได้ ${r.rows.length}`
  );
}

console.log("\n[4] key ระดับแพลตฟอร์ม (tenant_id = null) ยังกันซ้ำได้จริง");
{
  const r = await db.query(`select tenant_id from sc_settings where key = 'backup_success_notify'`);
  check(
    r.rows.length === 1 && r.rows[0].tenant_id === null,
    "backup_success_notify ถูกย้ายเป็น tenant_id = null อัตโนมัติ (ไม่ใช่ข้อมูลของ tenant ไหน)",
    `ได้ ${JSON.stringify(r.rows)}`
  );
}
await shouldFail(
  "insert key='backup_success_notify' ซ้ำอีกแถวด้วย tenant_id = null",
  `insert into sc_settings (key, value, tenant_id) values ('backup_success_notify', 'false', null)`
);

console.log("\n[5] rollback (ไม่มี key ชนกันตอนนี้เพราะ tenant 2 ใช้ key คนละแถวจาก tenant 1)");
await db.exec(`delete from sc_settings where tenant_id = '${T2}'`); // ล้างก่อน rollback กันชนกัน PK เดี่ยว
await shouldSucceed("รัน rollback ผ่าน (หลังลบ key ที่ชนกันออกก่อน)", rollback0032);
{
  const r = await db.query(`select conname from pg_constraint where conname = 'sc_settings_pkey'`);
  check(r.rows.length === 1, "PK เดี่ยว (key) กลับมาแล้วหลัง rollback", "ไม่พบ PK เดิมหลัง rollback");
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0032 ผ่านทุกข้อ — สอง tenant ใช้ key ชื่อเดียวกันพร้อมกันได้, key ระดับแพลตฟอร์มยังกันซ้ำได้, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
