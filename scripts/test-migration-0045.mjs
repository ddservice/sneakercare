#!/usr/bin/env node
/**
 * รัน migration 0045 (ลิงก์ sc_sales ↔ ใบรับงาน) ผ่าน PGlite
 *
 * ตรวจ:
 *   1. มีคอลัมน์ service_order_id
 *   2. ใบรับงานหนึ่งใบลงขายได้หนึ่งแถวต่อ tenant
 *   3. tenant อื่นใช้ order id เดียวกันได้ (ถ้าไม่มี unique ข้าม tenant)
 *   4. แถวที่ยังไม่ผูกใบรับงานมีได้หลายแถว
 *   5. รันซ้ำได้ · rollback คืนสภาพ
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0045_sales_service_order_link.sql"), "utf8");
const rollback = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0045_rollback.sql"), "utf8");

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

const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "00000000-0000-0000-0000-000000000002";
const ORDER = "11111111-1111-1111-1111-111111111111";

console.log("\n[0045] ลิงก์ขายกับใบรับงาน");

await db.exec(`
  create table public.sc_sales (
    id bigint generated always as identity primary key,
    date date not null,
    tenant_id uuid not null,
    total_revenue numeric not null default 0,
    client_request_id uuid
  );
`);

await db.exec(sql);

{
  const { rows } = await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'sc_sales' and column_name = 'service_order_id'
  `);
  check(rows.length === 1, "มีคอลัมน์ service_order_id", "ไม่มีคอลัมน์ service_order_id");
}

await db.exec(sql);
ok("รันซ้ำได้");

await db.exec(`
  insert into public.sc_sales (date, tenant_id, total_revenue, service_order_id)
  values ('2026-09-19', '${T1}', 400, '${ORDER}')
`);

let threw = false;
try {
  await db.exec(`
    insert into public.sc_sales (date, tenant_id, total_revenue, service_order_id)
    values ('2026-09-19', '${T1}', 400, '${ORDER}')
  `);
} catch (e) {
  threw = /duplicate key|unique/i.test(String(e.message));
}
check(threw, "ใบรับงานเดียวกันลงขายซ้ำใน tenant ไม่ได้", "ยังลงขายซ้ำได้");

await db.exec(`
  insert into public.sc_sales (date, tenant_id, total_revenue, service_order_id)
  values ('2026-09-19', '${T2}', 400, '${ORDER}')
`);
ok("tenant อื่นใช้เลขใบเดียวกันได้");

await db.exec(`
  insert into public.sc_sales (date, tenant_id, total_revenue)
  values ('2026-09-19', '${T1}', 200), ('2026-09-19', '${T1}', 300)
`);
ok("แถวยอดขายรายวันที่ไม่มีใบรับงานมีได้หลายแถว");

await db.exec(rollback);
const { rows: after } = await db.query(`
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = 'sc_sales' and column_name = 'service_order_id'
`);
check(after.length === 0, "rollback ลบ service_order_id", "rollback ยังเหลือคอลัมน์");

await db.close();
if (failures) {
  console.log(`\n[0045] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[0045] ผ่านทั้งหมด");
}
