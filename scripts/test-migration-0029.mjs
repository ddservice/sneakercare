#!/usr/bin/env node
/**
 * รัน migration 0029 + 0030 (role 'super_admin') ใส่ Postgres จริงผ่าน PGlite
 *
 * 🔴 บทเรียนจริง (2026-09-16): รอบแรกเขียนเทสต์นี้โดยจำลองแค่โลก local/CI (role เป็น
 * `user_role` enum ตาม 0001_init.sql) แล้วเทสต์ผ่านหมด — แต่พอเจ้าของรันจริงบน production
 * ได้ error `type "public.user_role" does not exist` ทันที เพราะ production จริง
 * `profiles.role` เป็น `text` + CHECK constraint (`profiles_role_check`) ต่างหาก
 * (ตรงกับที่ 0022 เคยบันทึกไว้แล้ว แต่ตอนเขียน 0029/0030 ลืมเช็คซ้ำ) — **เทสต์ที่จำลองแค่
 * สภาพแวดล้อมเดียวจึงจับบั๊กนี้ไม่ได้เลย ทั้งที่มันเป็น prod/local divergence แบบเดียวกับที่
 * 0012 เคยเจอกับตาราง inv_* มาก่อนแล้ว** ตั้งแต่ตอนนี้เทสต์นี้จึงจำลอง**สองสภาพแวดล้อมแยกกัน**
 * ในทุกเทสต์เคส ไม่ใช่แค่ตัวเดียว:
 *   A. "local/CI" — role เป็น `user_role` enum จริง (ตาม 0001_init.sql)
 *   B. "production" — role เป็น `text` + `profiles_role_check` (ตรวจกับ production จริงแล้ว
 *      ว่านี่คือของจริง ผ่าน `pg_get_constraintdef` เมื่อ 2026-09-16)
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0029 = fs.readFileSync(path.join(root, "supabase/migrations/0029_super_admin_role.sql"), "utf8");
const sql0030 = fs.readFileSync(path.join(root, "supabase/migrations/0030_super_admin_constraints.sql"), "utf8");
const rollback0030 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0030_rollback.sql"), "utf8");

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

const TENANT_STUB = `
  create table tenants (id uuid primary key default gen_random_uuid());
  insert into tenants (id) values ('00000000-0000-0000-0000-000000000001'::uuid);
`;

// โลก A: local/CI — role เป็น enum จริง (ตาม 0001_init.sql)
const STUB_ENUM = `
  create type user_role as enum ('admin', 'co_admin', 'staff');
  ${TENANT_STUB}
  create table profiles (
    id uuid primary key default gen_random_uuid(),
    role user_role not null default 'staff',
    branch_id uuid,
    tenant_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
      references tenants(id)
  );
`;

// โลก B: production จริง — role เป็น text + CHECK (ยืนยันด้วย pg_get_constraintdef บน
// production จริงเมื่อ 2026-09-16 — 5 constraint: id_fkey, pkey, role_check, tenant_id_fkey,
// username_key — **ไม่มี** chk_branch_required_for_non_admin เลย)
const STUB_TEXT_CHECK = `
  ${TENANT_STUB}
  create table profiles (
    id uuid primary key default gen_random_uuid(),
    username text unique,
    role text not null default 'staff',
    branch_id uuid,
    tenant_id uuid not null default '00000000-0000-0000-0000-000000000001'::uuid
      references tenants(id),
    constraint profiles_role_check
      check (role = any (array['admin', 'co-admin', 'co_admin', 'staff', 'manager']))
  );
`;

async function runWorld(label, stub) {
  console.log(`\n═══ โลก: ${label} ═══`);
  const db = new PGlite();
  await db.exec(stub);

  try {
    await db.exec(sql0029);
    ok("รัน 0029 ผ่าน");
  } catch (e) {
    bad(`รัน 0029 ไม่ผ่าน\n     ${e.message}`);
  }
  try {
    await db.exec(sql0029);
    ok("รัน 0029 ซ้ำได้โดยไม่พัง (idempotent)");
  } catch (e) {
    bad(`รัน 0029 ซ้ำพัง\n     ${e.message}`);
  }
  try {
    await db.exec(sql0030);
    ok("รัน 0030 ผ่าน");
  } catch (e) {
    bad(`รัน 0030 ไม่ผ่าน\n     ${e.message}`);
  }
  try {
    await db.exec(sql0030);
    ok("รัน 0030 ซ้ำได้โดยไม่พัง (idempotent)");
  } catch (e) {
    bad(`รัน 0030 ซ้ำพัง\n     ${e.message}`);
  }

  try {
    await db.exec(`insert into profiles (role, branch_id, tenant_id) values ('super_admin', null, null)`);
    ok("super_admin สร้างโดยไม่มี branch_id และ tenant_id ได้");
  } catch (e) {
    bad(`super_admin ควรสร้างได้โดยไม่มี branch_id/tenant_id\n     ${e.message}`);
  }

  try {
    await db.exec(`insert into profiles (role, branch_id, tenant_id) values ('staff', null, null)`);
    bad("staff ไม่มี branch_id ควรถูกปฏิเสธ แต่กลับสำเร็จ");
  } catch (e) {
    ok(`staff ไม่มี branch_id ถูกปฏิเสธจริง → ${e.message.split("\n")[0]}`);
  }

  try {
    await db.exec(
      `insert into profiles (role, branch_id, tenant_id) values ('staff', gen_random_uuid(), null)`
    );
    bad("staff ไม่มี tenant_id ควรถูกปฏิเสธ แต่กลับสำเร็จ");
  } catch (e) {
    ok(`staff ไม่มี tenant_id ถูกปฏิเสธจริง → ${e.message.split("\n")[0]}`);
  }

  try {
    await db.exec(
      `insert into profiles (role, branch_id, tenant_id) values ('admin', null, '00000000-0000-0000-0000-000000000001')`
    );
    ok("admin ปกติ (มี tenant, ไม่มี branch_id) ยังสร้างได้เหมือนเดิม — ไม่กระทบพฤติกรรมเดิม");
  } catch (e) {
    bad(`admin ปกติควรยังสร้างได้เหมือนเดิม\n     ${e.message}`);
  }

  try {
    await db.exec(
      `insert into profiles (role, branch_id, tenant_id) values ('co_admin', gen_random_uuid(), '00000000-0000-0000-0000-000000000001')`
    );
    ok("co_admin ค่าสะกดเดิม (underscore) ยังสร้างได้ปกติ — ไม่กระทบของเดิมที่มีอยู่แล้ว");
  } catch (e) {
    bad(`co_admin ปกติควรยังสร้างได้เหมือนเดิม\n     ${e.message}`);
  }

  try {
    await db.exec(`delete from profiles where role = 'super_admin'`);
    await db.exec(rollback0030);
    ok("รัน rollback 0030 ผ่าน");
  } catch (e) {
    bad(`rollback 0030 พัง\n     ${e.message}`);
  }
  {
    const r = await db.query(
      `select conname from pg_constraint where conname = 'chk_tenant_required_for_non_super_admin'`
    );
    check(r.rows.length === 0, "constraint ของ tenant_id ถูกถอดออกหลัง rollback", "constraint ยังอยู่หลัง rollback");
  }

  await db.close();
}

await runWorld("A. local/CI (role เป็น user_role enum)", STUB_ENUM);
await runWorld("B. production จริง (role เป็น text + profiles_role_check)", STUB_TEXT_CHECK);

// ── ยืนยันเหตุผลที่ต้องแยกไฟล์: รวมไว้ทรานแซกชันเดียวกัน (เฉพาะโลก enum) ต้องพัง ──────
console.log("\n═══ พิสูจน์ว่าต้องแยกไฟล์จริง (เฉพาะโลก enum — โลก text ไม่ติดข้อจำกัดนี้) ═══");
{
  const db = new PGlite();
  await db.exec(STUB_ENUM);
  try {
    await db.exec(sql0029 + "\n" + sql0030);
    bad("รวมสองไฟล์ในทรานแซกชันเดียวกันกลับสำเร็จ — แปลว่าเหตุผลที่แยกไฟล์เข้าใจผิด ต้องทบทวนคอมเมนต์ในไฟล์");
  } catch (e) {
    ok(`รวมกันพังตามคาด → ${e.message.split("\n")[0]}`);
  }
  await db.close();
}

console.log(
  failures === 0
    ? `\n✅ migration 0029+0030 ผ่านทุกข้อ ทั้งสองโลก (enum และ text+CHECK) — idempotent, constraint ถูกทั้งสองทิศ, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
