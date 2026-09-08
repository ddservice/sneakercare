#!/usr/bin/env node
/**
 * รัน migration 0026 ใส่ Postgres จริง (PGlite/WASM — ไม่ต้องมี Docker)
 *
 * ทำไมต้องมี: migration ต้อง apply ด้วยมือผ่าน Supabase SQL Editor (repo ไม่มีสิทธิ์ DDL)
 * ⇒ SQL ที่พิมพ์ผิดจะไปรู้ตอนเจ้าของ paste ลง production แล้ว
 *
 * รัน: npm run test:migration
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0026 = fs.readFileSync(path.join(root, "supabase/migrations/0026_sc_payslips_and_rentals.sql"), "utf8");
const rollback0026 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0026_rollback.sql"), "utf8");

const db = new PGlite();
let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => { console.log(`  ✗ ${m}`); failures++; };
function check(cond, okMsg, badMsg) { if (cond) ok(okMsg); else bad(badMsg); }
async function shouldSucceed(label, sql) {
  try { await db.exec(sql); ok(label); } catch (e) { bad(`${label}\n     ${e.message}`); }
}
async function shouldFail(label, sql) {
  try { await db.exec(sql); bad(`${label} — แต่กลับสำเร็จ (constraint ไม่ทำงาน)`); } catch { ok(label); }
}
async function count(sql) { const { rows } = await db.query(sql); return Number(rows[0]?.n ?? 0); }

console.log("\n[0026-1] เตรียมสภาพแวดล้อมจำลอง");
await shouldSucceed(
  "สร้าง role / profiles / inv_branches / sc_get_my_role() / sc_touch_updated_at()",
  `
  create role anon;
  create role authenticated;
  create table profiles (id uuid primary key, role text not null default 'staff');
  create table inv_branches (id uuid primary key default gen_random_uuid(), name text);
  create or replace function public.sc_get_my_role() returns text
    language sql stable as $fn$ select 'admin'::text $fn$;
  create or replace function public.sc_touch_updated_at() returns trigger
    language plpgsql as $fn$ begin new.updated_at := now(); return new; end; $fn$;
  `
);

console.log("\n[0026-2] รัน migration 0026");
await shouldSucceed("รันครั้งแรกบนฐานข้อมูลเปล่า", sql0026);
await shouldSucceed("รันซ้ำได้ (idempotent)", sql0026);

console.log("\n[0026-3] โครงสร้างที่ต้องได้");
for (const t of ["sc_payslips", "sc_payslip_deductions", "sc_rental_records"]) {
  check(await count(`select count(*)::int as n from pg_tables where schemaname='public' and tablename='${t}'`) === 1,
    `มีตาราง ${t}`, `ไม่มีตาราง ${t}`);
  check(await count(`select count(*)::int as n from pg_class where relname='${t}' and relrowsecurity = true`) === 1,
    `${t} เปิด RLS แล้ว`, `${t} ยังไม่เปิด RLS`);
  check(await count(`select count(*)::int as n from pg_policies where schemaname='public' and tablename='${t}'`) === 4,
    `${t} มี policy ครบ 4 ตัว`, `${t} policy ไม่ครบ`);
}

console.log("\n[0026-4] constraint ของสลิปเงินเดือน");
await shouldSucceed("บันทึกสลิปปกติได้",
  `insert into sc_payslips (month, employee_name, base_salary, net_pay) values ('08/2026', 'ก', 12000, 11900)`);
await shouldFail("กันเดือนผิดรูปแบบ (ต้องเป็น MM/YYYY)",
  `insert into sc_payslips (month, employee_name) values ('2026-08', 'ข')`);
await shouldFail("กันชื่อพนักงานว่าง",
  `insert into sc_payslips (month, employee_name) values ('08/2026', '   ')`);
await shouldFail("กัน timestamp ในช่องเงิน",
  `insert into sc_payslips (month, employee_name, net_pay) values ('08/2026', 'ค', 1787827245489)`);
await shouldFail("กันสลิปซ้ำ (คนเดิม เดือนเดิม)",
  `insert into sc_payslips (month, employee_name) values ('08/2026', 'ก')`);
await shouldFail("กัน commission_pct เกิน 100",
  `insert into sc_payslips (month, employee_name, commission_pct) values ('08/2026', 'ง', 101)`);

console.log("\n[0026-5] รายการหักผูกกับสลิปและลบตามกัน");
await shouldSucceed("บันทึกรายการหักรูปแบบใหม่ ({name,amount}) ได้",
  `insert into sc_payslip_deductions (payslip_id, name, amount, legacy_ref)
   select id, 'มาสาย', 68, '08/2026|ก|0' from sc_payslips where employee_name = 'ก'`);
await shouldSucceed("บันทึกรายการหักรูปแบบเก่า ({type,detail,minutes,rate}) ได้",
  `insert into sc_payslip_deductions (payslip_id, name, amount, kind, detail, minutes, rate, legacy_ref)
   select id, 'ขาด', 1200, 'ขาด', 'หยุดงาน', 0, 0, '08/2026|ก|1' from sc_payslips where employee_name = 'ก'`);
await shouldFail("กัน backfill รายการหักซ้ำ",
  `insert into sc_payslip_deductions (payslip_id, name, amount, legacy_ref)
   select id, 'มาสาย', 68, '08/2026|ก|0' from sc_payslips where employee_name = 'ก'`);
await shouldFail("กันรายการหักที่ไม่มีสลิปต้นทาง (FK)",
  `insert into sc_payslip_deductions (payslip_id, name, amount) values (999999, 'ลอย', 10)`);
await db.exec(`delete from sc_payslips where employee_name = 'ก'`);
check(await count(`select count(*)::int as n from sc_payslip_deductions`) === 0,
  "ลบสลิปแล้วรายการหักหายตามด้วย (on delete cascade)", "รายการหักยังค้างอยู่หลังลบสลิป");

console.log("\n[0026-6] ห้องเช่า");
await shouldSucceed("บันทึกห้องเช่าได้",
  `insert into sc_rental_records (month, room_index, room_name, prev_meter, curr_meter, rent_amount, income_amount, legacy_ref)
   values ('08/2026', 0, 'ชั้น 3 ห้อง 1', 245, 330, 3000, 3425, '08/2026|0')`);
await shouldFail("กันห้องซ้ำในเดือนเดียวกัน",
  `insert into sc_rental_records (month, room_index) values ('08/2026', 0)`);
await shouldFail("กันเลขห้องติดลบ",
  `insert into sc_rental_records (month, room_index) values ('08/2026', -1)`);
await db.exec(`update sc_rental_records set rent_amount = 3100 where room_index = 0`);
check(await count(`select count(*)::int as n from sc_rental_records where updated_at > created_at`) === 1,
  "trigger updated_at ทำงาน", "updated_at ไม่ขยับหลัง update");

console.log("\n[0026-7] rollback ต้องลบของที่สร้างได้หมด");
await shouldSucceed("รัน rollback ได้", rollback0026);
check(await count(`select count(*)::int as n from pg_tables where schemaname='public'
   and tablename in ('sc_payslips','sc_payslip_deductions','sc_rental_records')`) === 0,
  "ไม่เหลือตารางค้าง", "ยังเหลือตารางค้าง");

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด" : `\n❌ ไม่ผ่าน ${failures} ข้อ`);
await db.close();
process.exitCode = failures === 0 ? 0 : 1;
