#!/usr/bin/env node
/**
 * รัน migration 0042 (WHT + หมวดค่าเช่าอาคาร) ผ่าน PGlite
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0042_wht_rent.sql"), "utf8");
const rollback = fs.readFileSync(
  path.join(root, "supabase/migrations/rollback/0042_rollback.sql"),
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

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";

const db = new PGlite();
await db.exec(`
  create role anon;
  create table public.tenants (
    id uuid primary key,
    name text not null
  );
  insert into public.tenants (id, name) values ('${T1}', 'T1'), ('${T2}', 'T2');

  create table public.profiles (
    id uuid primary key
  );

  create table public.sc_expense_categories (
    key text primary key,
    label text not null,
    short_label text not null,
    sort_order int not null default 100,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
  );
  insert into public.sc_expense_categories (key, label, short_label, sort_order) values
    ('facility_utilities', 'สาธารณูปโภค', 'สาธารณูปโภค & ค่าเช่า', 20);

  create table public.sc_rental_records (
    id bigint generated always as identity primary key,
    month text not null,
    room_index int not null,
    income_amount numeric(12,2) not null default 0,
    rent_amount numeric(12,2) not null default 0,
    tenant_id uuid not null references public.tenants(id)
  );
`);

console.log("\n[0042] WHT payees + certificates + building rent");

await db.exec(sql);

const { rows: cats } = await db.query(
  `select key, short_label from public.sc_expense_categories where key = 'building_rent'`
);
check(cats[0]?.short_label === "ค่าเช่าอาคาร/สถานที่", "มีหมวดค่าเช่าอาคาร/สถานที่", "ขาดหมวด building_rent");

await db.exec(sql);
ok("รันซ้ำได้ (idempotent)");

await db.query(
  `insert into public.sc_wht_payees (tenant_id, kind, name, tax_id, address)
   values ($1, 'person', 'นายเจ้าของ ตึก', '1234567890123', 'เชียงใหม่')`,
  [T1]
);

const { rows: payees } = await db.query(`select kind, tax_id from public.sc_wht_payees`);
check(payees.length === 1, "บันทึกเจ้าของตึกได้", `payees = ${payees.length}`);

try {
  await db.query(
    `insert into public.sc_wht_payees (tenant_id, kind, name, tax_id)
     values ($1, 'person', 'ซ้ำ', '1234567890123')`,
    [T1]
  );
  bad("unique (tenant_id, tax_id) ควรกันเลขซ้ำในกิจการเดียวกัน");
} catch {
  ok("กันเลขผู้เสียภาษีซ้ำในกิจการเดียวกัน");
}

await db.query(
  `insert into public.sc_wht_payees (tenant_id, kind, name, tax_id)
   values ($1, 'person', 'คนละกิจการ', '1234567890123')`,
  [T2]
);
ok("กิจการอื่นใช้เลขผู้เสียภาษีเดียวกันได้");

await db.query(
  `insert into public.sc_wht_certificates (
     tenant_id, direction, form_type, certificate_number, payment_date,
     base_amount, vat_amount, gross_amount, wht_rate, tax_amount, net_payment, legacy_opex_id
   ) values (
     $1, 'payable', 'PND3', 'WHT-202609-0001', '2026-09-01',
     18000, 0, 18000, 5, 900, 17100, 99
   )`,
  [T1]
);
const { rows: certs } = await db.query(
  `select tax_amount, net_payment from public.sc_wht_certificates`
);
check(Number(certs[0]?.tax_amount) === 900, "WHT ฿900", `tax = ${certs[0]?.tax_amount}`);
check(Number(certs[0]?.net_payment) === 17100, "โอนสุทธิ ฿17,100", `net = ${certs[0]?.net_payment}`);

try {
  await db.query(
    `insert into public.sc_wht_certificates (
       tenant_id, form_type, certificate_number, payment_date,
       base_amount, gross_amount, wht_rate, tax_amount, net_payment, legacy_opex_id
     ) values ($1, 'PND3', 'WHT-202609-0002', '2026-09-01', 1, 1, 5, 0.05, 0.95, 99)`,
    [T1]
  );
  bad("หนึ่งรายการค่าใช้จ่ายควรมีหนังสือรับรองได้ใบเดียว");
} catch {
  ok("กันหนังสือรับรองซ้ำต่อรายการค่าใช้จ่าย");
}

await db.query(
  `insert into public.sc_rental_records (month, room_index, income_amount, rent_amount, tenant_id, tenant_name, wht_rate, wht_withheld)
   values ('09/2026', 0, 6000, 6000, $1, 'พนักงาน ก', 5, 300)`,
  [T1]
);
const { rows: rooms } = await db.query(
  `select tenant_name, wht_withheld from public.sc_rental_records`
);
check(rooms[0]?.tenant_name === "พนักงาน ก", "เก็บชื่อผู้เช่าได้", `name = ${rooms[0]?.tenant_name}`);
check(Number(rooms[0]?.wht_withheld) === 300, "เก็บยอดถูกหักได้", `wht = ${rooms[0]?.wht_withheld}`);

await db.exec(rollback);
const { rows: gone } = await db.query(
  `select tablename from pg_tables where schemaname = 'public' and tablename like 'sc_wht_%'`
);
check(gone.length === 0, "rollback ลบตาราง WHT", `เหลือ ${gone.map((r) => r.tablename)}`);
const { rows: catGone } = await db.query(
  `select 1 from public.sc_expense_categories where key = 'building_rent'`
);
check(catGone.length === 0, "rollback ลบหมวดค่าเช่าอาคาร", "หมวดยังอยู่");

await db.close();
if (failures) {
  console.error(`\n[0042] ไม่ผ่าน ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[0042] ผ่านทั้งหมด");
}
