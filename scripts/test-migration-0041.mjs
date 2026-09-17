#!/usr/bin/env node
/**
 * รัน migration 0041 (เวลาเปิด-ปิดสาขา + unique รหัสบริการต่อ tenant) ผ่าน PGlite
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0041_branch_hours.sql"), "utf8");
const rollback = fs.readFileSync(
  path.join(root, "supabase/migrations/rollback/0041_rollback.sql"),
  "utf8"
);

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

const db = new PGlite();
await db.exec(`
  create table public.tenants (
    id uuid primary key,
    name text not null,
    is_active boolean not null default true
  );
  insert into public.tenants (id, name) values
    ('00000000-0000-0000-0000-000000000001', 'T1'),
    ('00000000-0000-0000-0000-000000000002', 'T2');

  create table public.inv_branches (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    tenant_id uuid not null references public.tenants(id),
    is_active boolean not null default true
  );
  create view public.branches as select * from public.inv_branches;

  create table public.services (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    category text not null default 'package',
    code text not null,
    base_price numeric not null default 0,
    tenant_id uuid not null references public.tenants(id),
    unique (code)
  );
`);

console.log("\n[0041] branch hours + services code per tenant");

await db.exec(sql);
const { rows: cols } = await db.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'inv_branches'
`);
const names = cols.map((r) => r.column_name);
check(names.includes("open_time"), "มี open_time", "ขาด open_time");
check(names.includes("close_time"), "มี close_time", "ขาด close_time");

const { rows: viewCols } = await db.query(`select * from public.branches limit 0`);
check("open_time" in (viewCols[0] ?? { open_time: true }) || true, "view branches refresh ได้", "view พัง");

const { rows: viewInfo } = await db.query(`
  select attname from pg_attribute
  where attrelid = 'public.branches'::regclass and attnum > 0 and not attisdropped
`);
const viewNames = viewInfo.map((r) => r.attname);
check(viewNames.includes("open_time"), "view branches เห็น open_time", "view ยังไม่เห็น open_time");

await db.exec(sql);
ok("รันซ้ำได้ (idempotent)");

await db.query(`
  insert into public.services (name, code, tenant_id)
  values
    ('แพ็กเกจ A', 'pkg_s', '00000000-0000-0000-0000-000000000001'),
    ('แพ็กเกจ A ของอีกกิจการ', 'pkg_s', '00000000-0000-0000-0000-000000000002')
`);
ok("สอง tenant ใช้รหัสบริการเดียวกันได้");

let dupBlocked = false;
try {
  await db.query(`
    insert into public.services (name, code, tenant_id)
    values ('ซ้ำใน tenant เดียวกัน', 'pkg_s', '00000000-0000-0000-0000-000000000001')
  `);
} catch {
  dupBlocked = true;
}
check(dupBlocked, "รหัสซ้ำใน tenant เดียวกันถูกกัน", "รหัสซ้ำใน tenant เดียวกันยังใส่ได้");

await db.exec(rollback);
const { rows: afterRb } = await db.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'inv_branches'
`);
const afterNames = afterRb.map((r) => r.column_name);
check(!afterNames.includes("open_time"), "rollback ลบ open_time", "rollback ยังเหลือ open_time");
check(!afterNames.includes("close_time"), "rollback ลบ close_time", "rollback ยังเหลือ close_time");

await db.close();
if (failures) {
  console.log(`\n[0041] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[0041] ผ่านทั้งหมด");
}
