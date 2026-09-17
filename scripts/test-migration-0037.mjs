#!/usr/bin/env node
/**
 * รัน migration 0037 (default_shift/default_day_off/bonus_per_pair ให้ sc_employees +
 * ตาราง sc_staff_daily_stats ใหม่) ผ่าน PGlite
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. คอลัมน์ใหม่ครบใน sc_employees + backfill วันหยุดของ เชียง/มิ้ว/เจ ถูกต้อง (ข้อมูลจริงของ
 *      tenant #1 ต้องไม่หายหลัง migration)
 *   3. sc_staff_daily_stats: unique (tenant_id, employee_name, stat_date) กันบันทึกซ้ำวันเดียวกัน
 *   4. RLS: admin เห็น/เขียนได้แค่ tenant ตัวเอง, staff อ่านได้แต่เขียนไม่ได้, super_admin ข้ามได้
 *   5. rollback คืนสภาพเดิมได้
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0037 = fs.readFileSync(path.join(root, "supabase/migrations/0037_roster_staff_stats.sql"), "utf8");
const rollback0037 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0037_rollback.sql"), "utf8");

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
async function shouldFail(label, fn) {
  try {
    await fn();
    bad(`${label} — แต่กลับสำเร็จ`);
  } catch (e) {
    ok(`${label} → ${e.message.split("\n")[0]}`);
  }
}
async function actAs(uid) {
  await db.exec(`set role authenticated`);
  await db.query(`select set_config('test.uid', $1, false)`, [uid ?? ""]);
}
async function actAsOwner() {
  await db.exec(`reset role`);
}

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const U_ADMIN_1 = "10000000-0000-0000-0000-000000000001";
const U_ADMIN_2 = "20000000-0000-0000-0000-000000000002";
const U_STAFF_1 = "10000000-0000-0000-0000-000000000009";
const U_SUPER = "90000000-0000-0000-0000-000000000009";

console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (sc_employees แบบก่อน 0037 — มี เชียง/มิ้ว/เจ จริงของ tenant #1)");
await shouldSucceed(
  "สร้าง role/schema auth/tenants/profiles/sc_employees",
  `
  create role anon;
  create role authenticated;
  grant all on all tables in schema public to authenticated;
  grant all on all sequences in schema public to authenticated;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$ language sql stable;

  create table public.tenants (id uuid primary key, name text not null);
  insert into public.tenants (id, name) values ('${T1}', 'SneakerCare'), ('${T2}', 'LUXSU');
  create table public.profiles (id uuid primary key, username text, role text not null, tenant_id uuid references public.tenants(id));
  insert into public.profiles (id, username, role, tenant_id) values
    ('${U_ADMIN_1}', 'admin1', 'admin', '${T1}'),
    ('${U_ADMIN_2}', 'admin2', 'admin', '${T2}'),
    ('${U_STAFF_1}', 'staff1', 'staff', '${T1}'),
    ('${U_SUPER}', 'super', 'super_admin', null);
  create or replace function public.inv_fn_current_role() returns text
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select p.role from public.profiles p where p.id = auth.uid()
  $fn$;
  create or replace function public.fn_current_tenant() returns uuid
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select tenant_id from public.profiles where id = auth.uid()
  $fn$;

  create table public.sc_employees (
    id bigserial primary key, name text not null, salary numeric, position text,
    bank text, account text, status text, nickname text, comm_rate numeric,
    sso_exempt boolean, tenant_id uuid not null references public.tenants(id)
  );
  insert into public.sc_employees (name, nickname, tenant_id) values
    ('นายธีรภัทร ทาแผ', 'เชียง', '${T1}'), ('น.ส.สุทธินันท์ นนทจันทร์', 'มิ้ว', '${T1}'), ('รัชฎาพร ยั่งกุลมิ่ง', 'ไมโล', '${T1}');
  `
);

console.log("\n[2] รัน migration 0037");
await shouldSucceed("รันไฟล์ทั้งไฟล์", sql0037);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0037);
// GRANT เดิมที่ให้ authenticated ตอน [1] ไม่ครอบตารางใหม่ที่ migration เพิ่งสร้าง (sc_staff_daily_stats)
// ต้อง grant ซ้ำหลังสร้างตาราง — Postgres ไม่ retroactive grant ให้ตารางที่สร้างทีหลัง
await db.exec(`grant all on all tables in schema public to authenticated; grant all on all sequences in schema public to authenticated;`);

console.log("\n[3] backfill วันหยุดของพนักงานจริง tenant #1 ถูกต้อง (ข้อมูลเดิมต้องไม่หาย, match ที่ nickname)");
{
  const r = await db.query(`select nickname, default_day_off from public.sc_employees where tenant_id = '${T1}' order by nickname`);
  const byNick = Object.fromEntries(r.rows.map((row) => [row.nickname, row.default_day_off]));
  check(byNick["เชียง"] === 3, "เชียงได้ default_day_off = 3 (พุธ) — match ที่ nickname ไม่ใช่ name", `ได้ ${JSON.stringify(byNick)}`);
  check(byNick["มิ้ว"] === 0, "มิ้วได้ default_day_off = 0 (อาทิตย์)", `ได้ ${JSON.stringify(byNick)}`);
  check(
    byNick["ไมโล"] === null || byNick["ไมโล"] === undefined,
    "ไมโล (พนักงานใหม่ ไม่อยู่ใน 3 คนเดิม) ไม่ถูกเดา default_day_off ให้ — ปล่อย null ให้แอดมินตั้งเอง",
    `ได้ ${JSON.stringify(byNick)}`
  );
}

console.log("\n[3b] สร้างแถว sc_employees ให้ 'เจ' อัตโนมัติ (ไม่เคยมีแถวมาก่อน แต่มีอยู่จริงในระบบ payroll)");
{
  const r = await db.query(`select nickname, position, salary, default_day_off, tenant_id from public.sc_employees where nickname = 'เจ'`);
  check(
    r.rows.length === 1 && r.rows[0].default_day_off === 5 && r.rows[0].tenant_id === T1,
    `สร้างแถวให้เจแล้ว (default_day_off=5 ศุกร์, tenant_id ถูกต้อง)`,
    `ได้ ${JSON.stringify(r.rows)}`
  );
}

console.log("\n[4] sc_staff_daily_stats: unique (tenant_id, employee_name, stat_date) กันบันทึกซ้ำ");
await actAsOwner();
await shouldSucceed(
  "insert แถวแรก",
  `insert into public.sc_staff_daily_stats (tenant_id, employee_name, stat_date, attendance_status, pairs_handled)
   values ('${T1}', 'เชียง', '2026-09-17', 'normal', 12)`
);
await shouldFail("insert ซ้ำวันเดียวกัน คนเดียวกัน tenant เดียวกัน", async () => {
  await db.query(
    `insert into public.sc_staff_daily_stats (tenant_id, employee_name, stat_date) values ('${T1}', 'เชียง', '2026-09-17')`
  );
});
await shouldSucceed(
  "insert วันเดียวกัน คนเดียวกัน แต่คนละ tenant (ต้องไม่ชนกัน)",
  `insert into public.sc_staff_daily_stats (tenant_id, employee_name, stat_date) values ('${T2}', 'เชียง', '2026-09-17')`
);
await db.exec(`delete from public.sc_staff_daily_stats where tenant_id = '${T2}'`);

console.log("\n[5] RLS: admin เห็น/เขียนได้แค่ tenant ตัวเอง");
await actAs(U_ADMIN_1);
{
  const r = await db.query(`select tenant_id from public.sc_staff_daily_stats`);
  const tenants = new Set(r.rows.map((x) => x.tenant_id));
  check(tenants.size === 1 && tenants.has(T1), "admin1 เห็นแค่แถวของ tenant ตัวเอง", `เห็น ${JSON.stringify([...tenants])}`);
}
await shouldFail("admin1 (T1) insert ข้าม tenant ไปที่ T2", async () => {
  await db.query(`insert into public.sc_staff_daily_stats (tenant_id, employee_name, stat_date) values ('${T2}', 'HACK', '2026-09-18')`);
});

console.log("\n[6] staff อ่านได้ แต่เขียนไม่ได้");
await actAs(U_STAFF_1);
{
  const r = await db.query(`select id from public.sc_staff_daily_stats`);
  check(r.rows.length === 1, "staff1 อ่านแถวของ tenant ตัวเองได้", `ได้ ${r.rows.length} แถว`);
}
await shouldFail("staff1 insert แถวใหม่", async () => {
  await db.query(`insert into public.sc_staff_daily_stats (tenant_id, employee_name, stat_date) values ('${T1}', 'เจ', '2026-09-18')`);
});

console.log("\n[7] super_admin เห็นข้ามทุก tenant");
await actAsOwner();
await db.exec(`insert into public.sc_staff_daily_stats (tenant_id, employee_name, stat_date) values ('${T2}', 'พนักงานลักซู', '2026-09-17')`);
await actAs(U_SUPER);
{
  const r = await db.query(`select tenant_id from public.sc_staff_daily_stats`);
  const tenants = new Set(r.rows.map((x) => x.tenant_id));
  check(tenants.has(T1) && tenants.has(T2), "super_admin เห็นทั้ง T1 และ T2", `เห็น ${JSON.stringify([...tenants])}`);
}

console.log("\n[8] rollback คืนสภาพเดิม");
await actAsOwner();
await shouldSucceed("รัน rollback ผ่าน", rollback0037);
{
  const r = await db.query(`select table_name from information_schema.tables where table_name = 'sc_staff_daily_stats'`);
  check(r.rows.length === 0, "sc_staff_daily_stats ถูกลบแล้วหลัง rollback", "ยังพบตารางอยู่");
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0037 ผ่านทุกข้อ — sc_employees มีค่ากะ/วันหยุดมาตรฐานต่อคนแล้ว (แทน hardcode), sc_staff_daily_stats แยก tenant ถูกต้อง, RLS ถูกต้อง, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
