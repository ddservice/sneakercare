#!/usr/bin/env node
/**
 * รัน migration 0043 (VAT ต่อสาขา) ผ่าน PGlite
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0043_branch_vat_registered.sql"), "utf8");
const rollback = fs.readFileSync(
  path.join(root, "supabase/migrations/rollback/0043_rollback.sql"),
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
    ('00000000-0000-0000-0000-000000000001', 'T1');

  create table public.inv_branches (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    tenant_id uuid not null references public.tenants(id),
    is_active boolean not null default true
  );
  insert into public.inv_branches (id, name, tenant_id) values
    ('11111111-1111-1111-1111-111111111111', 'สาขาเดิม', '00000000-0000-0000-0000-000000000001');
  create view public.branches as select * from public.inv_branches;
`);

console.log("\n[0043] vat_registered per branch");

await db.exec(sql);

const { rows: cols } = await db.query(`
  select column_name, column_default, is_nullable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'inv_branches' and column_name = 'vat_registered'
`);
check(cols.length === 1, "มี vat_registered", "ขาด vat_registered");
check(String(cols[0]?.is_nullable) === "NO", "NOT NULL", "ยังเป็น nullable");
check(
  String(cols[0]?.column_default || "").includes("true"),
  "default true",
  `default ไม่ใช่ true: ${cols[0]?.column_default}`
);

const { rows: existing } = await db.query(
  `select vat_registered from public.inv_branches where name = 'สาขาเดิม'`
);
check(existing[0]?.vat_registered === true, "สาขาเดิมได้ default จด VAT", "สาขาเดิมไม่จด VAT");

const { rows: viewInfo } = await db.query(`
  select attname from pg_attribute
  where attrelid = 'public.branches'::regclass and attnum > 0 and not attisdropped
`);
const viewNames = viewInfo.map((r) => r.attname);
check(viewNames.includes("vat_registered"), "view branches เห็น vat_registered", "view ยังไม่เห็น vat_registered");

const { rows: invoker } = await db.query(`
  select reloptions from pg_class
  where oid = 'public.branches'::regclass
`);
const opts = invoker[0]?.reloptions ?? [];
check(
  Array.isArray(opts) && opts.some((o) => /security_invoker=(true|on)/.test(String(o))),
  "view เป็น security_invoker",
  `view ไม่ได้ตั้ง security_invoker: ${JSON.stringify(opts)}`
);

await db.query(`
  insert into public.inv_branches (name, tenant_id, vat_registered)
  values ('สาขาไม่จด', '00000000-0000-0000-0000-000000000001', false)
`);
const { rows: unreg } = await db.query(
  `select vat_registered from public.inv_branches where name = 'สาขาไม่จด'`
);
check(unreg[0]?.vat_registered === false, "ตั้งไม่จด VAT ได้", "ตั้งไม่จด VAT ไม่ติด");

await db.exec(sql);
ok("รันซ้ำได้ (idempotent)");

await db.exec(rollback);
const { rows: afterRb } = await db.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'inv_branches' and column_name = 'vat_registered'
`);
check(afterRb.length === 0, "rollback ลบ vat_registered", "rollback ยังเหลือ vat_registered");

const { rows: afterView } = await db.query(`
  select attname from pg_attribute
  where attrelid = 'public.branches'::regclass and attnum > 0 and not attisdropped
`);
check(
  !afterView.map((r) => r.attname).includes("vat_registered"),
  "rollback แล้ว view ไม่มี vat_registered",
  "rollback แล้วยังเห็น vat_registered ใน view"
);

await db.close();
if (failures) {
  console.log(`\n[0043] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[0043] ผ่านทั้งหมด");
}
