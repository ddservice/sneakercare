#!/usr/bin/env node
/**
 * รัน migration 0040 (คอลัมน์บริบท request ของ sc_audit_logs) ผ่าน PGlite
 *
 * ตรวจ: รันได้ / รันซ้ำได้ / insert ใส่คอลัมน์ใหม่ได้ / rollback แล้วคอลัมน์หาย
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(
  path.join(root, "supabase/migrations/0040_sc_audit_request_context.sql"),
  "utf8"
);
const rollback = fs.readFileSync(
  path.join(root, "supabase/migrations/rollback/0040_rollback.sql"),
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

async function cols(db) {
  const { rows } = await db.query(`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'sc_audit_logs'
    order by ordinal_position
  `);
  return rows.map((r) => r.column_name);
}

const db = new PGlite();
await db.exec(`
  create table public.sc_audit_logs (
    id bigint generated always as identity primary key,
    action text not null,
    entity text not null,
    entity_id text,
    actor_id uuid,
    actor_name text not null default 'ระบบ',
    detail jsonb,
    created_at timestamptz not null default now()
  );
`);

console.log("\n[0040] sc_audit_logs request context");

await db.exec(sql);
const after = await cols(db);
for (const c of ["ip_address", "user_agent", "browser", "device", "page_path"]) {
  check(after.includes(c), `มีคอลัมน์ ${c}`, `ขาดคอลัมน์ ${c}`);
}

await db.exec(sql);
ok("รันซ้ำได้ (idempotent)");

await db.query(
  `insert into sc_audit_logs (action, entity, actor_name, ip_address, browser, device, page_path, user_agent)
   values ('CREATE', 'service_order', 'ทดสอบ', '1.2.3.4', 'Chrome', 'Windows', '/pos', 'Mozilla/5.0')`
);
const { rows } = await db.query(`select ip_address, browser, device, page_path from sc_audit_logs`);
check(rows[0]?.ip_address === "1.2.3.4", "insert เก็บ IP ได้", `IP = ${rows[0]?.ip_address}`);
check(rows[0]?.browser === "Chrome", "insert เก็บ browser ได้", `browser = ${rows[0]?.browser}`);
check(rows[0]?.device === "Windows", "insert เก็บ device ได้", `device = ${rows[0]?.device}`);
check(rows[0]?.page_path === "/pos", "insert เก็บหน้าได้", `page = ${rows[0]?.page_path}`);

await db.exec(rollback);
const afterRb = await cols(db);
check(!afterRb.includes("ip_address"), "rollback ลบ ip_address", "rollback ไม่ลบ ip_address");
check(!afterRb.includes("page_path"), "rollback ลบ page_path", "rollback ไม่ลบ page_path");

await db.close();
if (failures) {
  console.error(`\n0040 ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n0040 ผ่านทั้งหมด");
}
