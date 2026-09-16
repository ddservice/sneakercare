#!/usr/bin/env node
/**
 * รัน migration 0031 (บังคับ RLS ด้วย tenant_id จริง) ใส่ Postgres จริงผ่าน PGlite
 *
 * นี่คือเทสต์ที่มีความเสี่ยงสูงสุดในทั้งแผน multi-tenant — ถ้าพลาดจุดเดียวใน policy ของ
 * `profiles` คือ **ล็อกอินไม่ได้ทั้งระบบ** (ทุกหน้าเรียก requireProfile() ซึ่งอ่านแถวตัวเองจาก
 * profiles ผ่าน session ของผู้ใช้เอง ไม่ใช่ service_role) จึงจำลองสถานการณ์จริงแบบเต็ม:
 * สอง tenant คนละนิติบุคคล + super_admin แล้วยิง query "ในฐานะ" แต่ละคนจริงๆ ผ่าน
 * `set local test.uid` (จำลอง auth.uid() แบบเดียวกับที่ pgTAP suite เดิมของ repo นี้ใช้)
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. sc_get_my_role()/inv_fn_current_role()/fn_sc_is_admin() รู้จัก super_admin แล้ว
 *   3. admin ของ tenant A มองไม่เห็นแถวของ tenant B เลยในทุกตารางที่ทดสอบ (และกลับกัน)
 *   4. super_admin เห็นแถวของทั้งสอง tenant
 *   5. โต๊ะ `profiles` เอง — จุดเสี่ยงสุด — ผู้ใช้ยังอ่าน "แถวตัวเอง" ได้เสมอ (ไม่ล็อกตัวเองออก)
 *      และมองไม่เห็นผู้ใช้ของอีก tenant
 *   6. insert ข้าม tenant ถูกปฏิเสธ (with check)
 *   7. rollback คืนพฤติกรรมเดิม (เปิดกว้างแบบก่อน 0031) ได้จริง
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0031 = fs.readFileSync(path.join(root, "supabase/migrations/0031_tenant_rls_enforcement.sql"), "utf8");
const rollback0031 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0031_rollback.sql"), "utf8");

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

const T1 = "00000000-0000-0000-0000-000000000001"; // tenant เดิม (SneakerCare)
const T2 = "00000000-0000-0000-0000-000000000002"; // tenant ใหม่ (สปากระเป๋า/รองเท้า)
const U_ADMIN_1 = "10000000-0000-0000-0000-000000000001"; // admin ของ tenant 1
const U_ADMIN_2 = "20000000-0000-0000-0000-000000000002"; // admin ของ tenant 2
const U_SUPER = "90000000-0000-0000-0000-000000000009"; // super_admin ข้าม tenant

/** จำลอง "ล็อกอินเป็นใคร" — ตั้ง session GUC แล้วให้ auth.uid() อ่านค่านี้ (เหมือน pgTAP เดิม)
 * ⚠️ ต้อง SET ROLE authenticated ด้วยเสมอ ไม่ใช่แค่ตั้ง test.uid — PGlite (เหมือน Postgres
 * ทั่วไป) ให้ table owner / superuser bypass RLS โดยอัตโนมัติ ถ้าไม่ SET ROLE ออกจาก role
 * ที่สร้างตาราง (ซึ่งเป็น role เริ่มต้นของ connection) RLS จะไม่ถูกบังคับใช้เลยแม้ policy
 * จะเขียนถูกทุกตัว — เจอบั๊กนี้จากการรันเทสต์จริง (เห็นข้อมูลข้าม tenant ทุกตารางพร้อมกัน
 * ทั้งที่ policy ถูกต้อง) จึงต้องมี GRANT ให้ authenticated ด้วย ไม่ใช่แค่ policy อย่างเดียว
 * (ตรงกับสถาปัตยกรรมจริงของ Supabase: RLS + GRANT เป็นคนละด่านกัน ดู 0016 ที่ revoke
 * สิทธิ์ระดับตารางจาก anon ไปแล้วในอดีต) */
async function actAs(uid) {
  await db.exec(`set role authenticated`);
  if (uid === null) {
    await db.exec(`select set_config('test.uid', '', false)`);
  } else {
    await db.query(`select set_config('test.uid', $1, false)`, [uid]);
  }
}

/** กลับไปเป็น role เจ้าของ (bypass RLS) — ใช้ตอน seed ข้อมูลทดสอบ เหมือน service_role จริง */
async function actAsOwner() {
  await db.exec(`reset role`);
}

async function queryAs(uid, sql) {
  await actAs(uid);
  return db.query(sql);
}

async function shouldSucceed(label, sql) {
  try {
    await db.exec(sql);
    ok(label);
  } catch (e) {
    bad(`${label}\n     ${e.message}`);
  }
}

// ── [1] จำลองสภาพแวดล้อมแบบ "ใกล้ production ที่สุด" ────────────────────────
console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (2 tenant, RLS จริง, auth.uid() จำลอง)");
await shouldSucceed(
  "สร้าง role / schema auth / ตาราง + policy เดิมก่อน 0031 (จำลอง production)",
  `
  create role anon;
  create role authenticated;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$ language sql stable;

  create table tenants (id uuid primary key default gen_random_uuid(), name text not null);
  insert into tenants (id, name) values ('${T1}', 'SneakerCare'), ('${T2}', 'BagSpa');

  create table profiles (
    id uuid primary key,
    username text unique,
    role text not null default 'staff',
    branch_id uuid,
    tenant_id uuid references tenants(id),
    is_active boolean not null default true
  );
  insert into profiles (id, username, role, tenant_id) values
    ('${U_ADMIN_1}', 'admin1', 'admin', '${T1}'),
    ('${U_ADMIN_2}', 'admin2', 'admin', '${T2}'),
    ('${U_SUPER}', 'super', 'super_admin', null);
  create or replace function public.sc_get_my_role() returns text
  language sql stable security definer set search_path to 'public' as $fn$
    select case lower(replace(coalesce(p.role, ''), '_', '-'))
      when 'admin' then 'admin' when 'co-admin' then 'co-admin' when 'staff' then 'staff'
      else null end
    from profiles p where p.id = auth.uid() and coalesce(p.is_active, true)
  $fn$;
  create or replace function public.inv_fn_current_role() returns text
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select case lower(replace(coalesce(p.role, ''), '_', '-'))
      when 'admin' then 'admin' when 'co-admin' then 'co-admin' when 'staff' then 'staff'
      else null end
    from profiles p where p.id = auth.uid() and coalesce(p.is_active, true)
  $fn$;
  create or replace function fn_sc_is_admin() returns boolean as $$
    select exists (select 1 from profiles p where p.id = auth.uid() and p.role::text = 'admin')
  $$ language sql stable security definer set search_path = public, pg_temp;
  create or replace function public.inv_fn_current_branch() returns uuid as $$
    select branch_id from profiles where id = auth.uid()
  $$ language sql stable security definer set search_path = public, pg_temp;
  create or replace function public.fn_current_tenant() returns uuid
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select tenant_id from public.profiles where id = auth.uid()
  $fn$;

  alter table profiles enable row level security;
  create policy profiles_select_authenticated on profiles for select to authenticated using (true);
  create policy profiles_update on profiles for update to authenticated
    using ((id = (select auth.uid())) or (sc_get_my_role() = 'admin'::text));

  -- ตัวแทนของตารางที่จะเทสต์ (คอลัมน์เท่าที่ policy ต้องใช้)
  create table sc_sales (id bigserial primary key, tenant_id uuid references tenants(id), total_revenue numeric);
  alter table sc_sales enable row level security;
  create policy sc_sales_read_insert on sc_sales for select to authenticated using (true);
  create policy sc_sales_insert on sc_sales for insert to authenticated with check (true);

  create table sc_opex (id bigserial primary key, tenant_id uuid references tenants(id), amount numeric);
  alter table sc_opex enable row level security;
  create policy sc_opex_read_insert on sc_opex for select to authenticated
    using (sc_get_my_role() = any (array['admin','co-admin']));
  create policy sc_opex_insert on sc_opex for insert to authenticated
    with check (sc_get_my_role() = any (array['admin','co-admin']));

  create table sc_settings (key text primary key, value text, tenant_id uuid references tenants(id));
  alter table sc_settings enable row level security;
  create policy sc_settings_read on sc_settings for select to authenticated using (true);
  create policy sc_settings_write_admin on sc_settings for all to authenticated
    using (sc_get_my_role() = any (array['admin','co-admin']))
    with check (sc_get_my_role() = any (array['admin','co-admin']));

  create table customers (id uuid primary key default gen_random_uuid(), tenant_id uuid references tenants(id), name text);
  alter table customers enable row level security;
  create policy customers_authenticated_all on customers for all to authenticated using (true) with check (true);

  create table inv_items (id uuid primary key default gen_random_uuid(), tenant_id uuid references tenants(id), name text);
  alter table inv_items enable row level security;
  create policy inv_p_items_select on inv_items for select to authenticated using (true);
  create policy inv_p_items_write_admin_co_admin on inv_items for all to public
    using (inv_fn_current_role() = any (array['admin','co-admin']))
    with check (inv_fn_current_role() = any (array['admin','co-admin']));

  create table sc_audit_logs (id bigserial primary key, tenant_id uuid references tenants(id), action text);
  alter table sc_audit_logs enable row level security;
  create policy p_sc_audit_logs_read_admin on sc_audit_logs for select to authenticated using (fn_sc_is_admin());

  -- GRANT ระดับตาราง — RLS อย่างเดียวไม่พอ ต้องมีสิทธิ์ระดับตารางก่อนด้วย (เหมือน production จริง)
  grant select, update on profiles to authenticated;
  grant select, insert on sc_sales to authenticated;
  grant select, insert on sc_opex to authenticated;
  -- ตาราง bigserial ต้องการ USAGE บน sequence แยกต่างหากถึงจะ insert ได้ (grant บนตารางไม่พอ)
  grant usage on sequence sc_sales_id_seq to authenticated;
  grant usage on sequence sc_opex_id_seq to authenticated;
  grant usage on sequence sc_audit_logs_id_seq to authenticated;
  grant select, insert, update, delete on sc_settings to authenticated;
  grant select, insert, update, delete on customers to authenticated;
  grant select, insert, update, delete on inv_items to authenticated;
  grant select on sc_audit_logs to authenticated;
  `
);

// ── [2] รัน migration 0031 ──────────────────────────────────────────────
console.log("\n[2] รัน migration 0031");
await shouldSucceed("รันไฟล์ทั้งไฟล์ (มีแค่บางตารางในสภาพแวดล้อมจำลอง — ต้องไม่ล้ม)", sql0031);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0031);

// ── [3] ฟังก์ชัน role รู้จัก super_admin แล้ว ────────────────────────────
console.log("\n[3] ฟังก์ชัน role รู้จัก super_admin");
{
  const r1 = await queryAs(U_SUPER, `select sc_get_my_role() as r`);
  check(r1.rows[0]?.r === "super_admin", "sc_get_my_role() คืน 'super_admin' ให้บัญชี super_admin", `ได้ ${JSON.stringify(r1.rows[0])}`);
  const r2 = await queryAs(U_SUPER, `select inv_fn_current_role() as r`);
  check(r2.rows[0]?.r === "super_admin", "inv_fn_current_role() คืน 'super_admin' ให้บัญชี super_admin", `ได้ ${JSON.stringify(r2.rows[0])}`);
  const r3 = await queryAs(U_SUPER, `select fn_sc_is_admin() as r`);
  check(r3.rows[0]?.r === true, "fn_sc_is_admin() คืน true ให้บัญชี super_admin", `ได้ ${JSON.stringify(r3.rows[0])}`);
}

// ── ข้อมูลทดสอบ: 1 แถวต่อ tenant ในแต่ละตาราง ────────────────────────────
// ใส่ข้อมูลในฐานะ role เจ้าของตาราง (bypass RLS โดยธรรมชาติ) — เทียบเท่า service_role จริง
// ไม่ต้อง disable/enable RLS เพราะ ownership bypass ทำงานถูกอยู่แล้ว (พิสูจน์แล้วจาก [4])
await actAsOwner();
await db.exec(`
  insert into sc_sales (tenant_id, total_revenue) values ('${T1}', 1000), ('${T2}', 2000);
  insert into sc_opex (tenant_id, amount) values ('${T1}', 100), ('${T2}', 200);
  -- ⚠️ ใช้ key คนละชื่อโดยจำเป็น: sc_settings.key เป็น PRIMARY KEY เดี่ยว (ไม่ใช่ composite
  -- (tenant_id, key)) ตามของจริงบน production ⇒ วันนี้สอง tenant ยังมี key ชื่อ 'name' ซ้ำกัน
  -- ไม่ได้จริงๆ แม้จะมี tenant_id คนละอัน — เป็นช่องว่างจริงที่ CLAUDE.md บันทึกไว้แล้วว่าต้อง
  -- แก้ต่อในเฟส 3 (เปลี่ยน PK เป็น composite) ยังไม่ทำในไฟล์นี้ — ที่นี่แค่ทดสอบว่า RLS filter
  -- ด้วย tenant_id ทำงานถูก ไม่ได้ทดสอบว่า schema พร้อมใช้งานจริงแล้ว
  insert into sc_settings (key, value, tenant_id) values ('name_t1', 'ร้าน T1', '${T1}'), ('name_t2', 'ร้าน T2', '${T2}');
  insert into customers (tenant_id, name) values ('${T1}', 'ลูกค้า T1'), ('${T2}', 'ลูกค้า T2');
  insert into inv_items (tenant_id, name) values ('${T1}', 'สินค้า T1'), ('${T2}', 'สินค้า T2');
  insert into sc_audit_logs (tenant_id, action) values ('${T1}', 'log T1'), ('${T2}', 'log T2');
`);

// ── [4] admin ของแต่ละ tenant เห็นแค่ของตัวเอง ────────────────────────────
console.log("\n[4] tenant boundary — admin เห็นแค่ tenant ตัวเอง");
const TABLES = [
  ["sc_sales", "total_revenue"],
  ["sc_opex", "amount"],
  ["sc_settings", "value"],
  ["customers", "name"],
  ["inv_items", "name"],
  ["sc_audit_logs", "action"],
];
for (const [tbl] of TABLES) {
  const asT1 = await queryAs(U_ADMIN_1, `select tenant_id from ${tbl}`);
  const onlyT1 = asT1.rows.every((r) => r.tenant_id === T1);
  check(
    asT1.rows.length > 0 && onlyT1,
    `${tbl}: admin tenant 1 เห็น ${asT1.rows.length} แถว ทั้งหมดเป็น tenant 1`,
    `${tbl}: admin tenant 1 เห็นข้อมูลข้าม tenant! ${JSON.stringify(asT1.rows)}`
  );

  const asT2 = await queryAs(U_ADMIN_2, `select tenant_id from ${tbl}`);
  const onlyT2 = asT2.rows.every((r) => r.tenant_id === T2);
  check(
    asT2.rows.length > 0 && onlyT2,
    `${tbl}: admin tenant 2 เห็น ${asT2.rows.length} แถว ทั้งหมดเป็น tenant 2`,
    `${tbl}: admin tenant 2 เห็นข้อมูลข้าม tenant! ${JSON.stringify(asT2.rows)}`
  );
}

// ── [5] super_admin เห็นทั้งสอง tenant ────────────────────────────────────
console.log("\n[5] super_admin เห็นข้ามทุก tenant");
for (const [tbl] of TABLES) {
  const asSuper = await queryAs(U_SUPER, `select distinct tenant_id from ${tbl}`);
  const tenantsSeen = new Set(asSuper.rows.map((r) => r.tenant_id));
  check(
    tenantsSeen.has(T1) && tenantsSeen.has(T2),
    `${tbl}: super_admin เห็นทั้ง tenant 1 และ tenant 2`,
    `${tbl}: super_admin เห็นไม่ครบ — เห็นแค่ ${[...tenantsSeen].join(", ")}`
  );
}

// ── [6] profiles เอง — จุดเสี่ยงสุด: ต้องอ่านแถวตัวเองได้เสมอ ─────────────
console.log("\n[6] profiles — เส้นทาง login (จุดเสี่ยงสุดของทั้งแผน)");
{
  const self1 = await queryAs(U_ADMIN_1, `select id from profiles where id = '${U_ADMIN_1}'`);
  check(self1.rows.length === 1, "admin tenant 1 อ่านแถวตัวเองได้ (ล็อกอินไม่พัง)", `อ่านแถวตัวเองไม่ได้! ${JSON.stringify(self1.rows)}`);

  const self2 = await queryAs(U_ADMIN_2, `select id from profiles where id = '${U_ADMIN_2}'`);
  check(self2.rows.length === 1, "admin tenant 2 อ่านแถวตัวเองได้ (ล็อกอินไม่พัง)", `อ่านแถวตัวเองไม่ได้! ${JSON.stringify(self2.rows)}`);

  const selfSuper = await queryAs(U_SUPER, `select id from profiles where id = '${U_SUPER}'`);
  check(selfSuper.rows.length === 1, "super_admin อ่านแถวตัวเองได้ (ล็อกอินไม่พัง)", `อ่านแถวตัวเองไม่ได้! ${JSON.stringify(selfSuper.rows)}`);

  const listAsT1 = await queryAs(U_ADMIN_1, `select username from profiles`);
  const usernamesT1 = listAsT1.rows.map((r) => r.username).sort();
  check(
    JSON.stringify(usernamesT1) === JSON.stringify(["admin1"]),
    "admin tenant 1 เห็นรายชื่อผู้ใช้แค่ของ tenant ตัวเอง (ไม่เห็น admin2)",
    `เห็นผิด: ${JSON.stringify(usernamesT1)}`
  );

  const listAsSuper = await queryAs(U_SUPER, `select username from profiles`);
  const usernamesSuper = listAsSuper.rows.map((r) => r.username).sort();
  check(
    JSON.stringify(usernamesSuper) === JSON.stringify(["admin1", "admin2", "super"]),
    "super_admin เห็นผู้ใช้ทุก tenant",
    `เห็นผิด: ${JSON.stringify(usernamesSuper)}`
  );

  // ⚠️ ทดสอบ UPDATE โดยตรง ไม่ใช่แค่ SELECT — เจอบั๊กจริงบน production แล้วว่า policy
  // profiles_update ที่ apply จริงขาดเงื่อนไข "admin แก้ไขคนอื่นใน tenant ตัวเองได้" ไปเฉยๆ
  // ทั้งที่ไฟล์ migration ในเครื่องถูกต้อง (สาเหตุไม่ทราบแน่ชัด — อาจเป็น paste ไฟล์เวอร์ชัน
  // เก่ากว่า) แปลว่าแค่เทสต์ SELECT ไม่พอ ต้องเทสต์ UPDATE จริงด้วยเสมอ
  await actAsOwner();
  const STAFF_1 = "10000000-0000-0000-0000-000000000099";
  await db.exec(
    `insert into profiles (id, username, role, tenant_id) values ('${STAFF_1}', 'staff1', 'staff', '${T1}')`
  );
  await db.exec(`grant update on profiles to authenticated`);

  await actAs(U_ADMIN_1);
  const updateOwnTenant = await db.query(
    `update profiles set username = 'staff1_renamed' where id = '${STAFF_1}' returning id`
  );
  check(
    updateOwnTenant.rows.length === 1,
    "admin tenant 1 แก้ไขโปรไฟล์คนอื่นใน tenant ตัวเองได้ (เช่นปิดใช้งาน/เปลี่ยน role พนักงาน)",
    `admin tenant 1 ควรแก้ไขได้แต่กลับไม่มีแถวถูกอัปเดต — policy ขาดเงื่อนไข admin+tenant`
  );

  const updateCrossTenant = await db.query(
    `update profiles set username = 'hacked' where id = '${U_ADMIN_2}' returning id`
  );
  check(
    updateCrossTenant.rows.length === 0,
    "admin tenant 1 แก้ไขโปรไฟล์ของ tenant 2 ไม่ได้ (ถูก RLS กันไว้)",
    `admin tenant 1 แก้ไขโปรไฟล์ข้าม tenant ได้! นี่คือช่องโหว่จริง`
  );
}

// ── [7] insert ข้าม tenant ถูกปฏิเสธ (with check) ─────────────────────────
console.log("\n[7] insert ข้าม tenant ต้องถูกปฏิเสธ");
{
  await actAs(U_ADMIN_1);
  try {
    await db.exec(`insert into sc_opex (tenant_id, amount) values ('${T2}', 999)`);
    bad("admin tenant 1 insert ลง tenant 2 ควรถูกปฏิเสธ แต่กลับสำเร็จ");
  } catch (e) {
    ok(`admin tenant 1 insert ลง tenant 2 ถูกปฏิเสธจริง → ${e.message.split("\n")[0]}`);
  }

  try {
    await db.exec(`insert into sc_opex (tenant_id, amount) values ('${T1}', 999)`);
    ok("admin tenant 1 insert ลง tenant ตัวเองสำเร็จตามปกติ");
  } catch (e) {
    bad(`admin tenant 1 insert ลง tenant ตัวเองควรสำเร็จ\n     ${e.message}`);
  }
}

// ── [8] rollback คืนพฤติกรรมเดิม ──────────────────────────────────────────
console.log("\n[8] rollback");
await actAsOwner(); // DDL (drop/create policy) ต้องใช้สิทธิ์เจ้าของ ไม่ใช่ authenticated
await shouldSucceed("รัน rollback 0031 ผ่าน", rollback0031);
{
  const r = await queryAs(U_ADMIN_2, `select tenant_id from sc_sales`);
  check(
    r.rows.length === 2,
    "หลัง rollback: sc_sales เปิดกว้างแบบเดิม (admin tenant 2 เห็นทั้ง 2 แถวอีกครั้ง)",
    `หลัง rollback ควรเห็น 2 แถวแต่เห็น ${r.rows.length}`
  );
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0031 ผ่านทุกข้อ — tenant boundary ทำงานจริงทุกตารางที่ทดสอบ, super_admin ข้ามได้, profiles (เส้นทาง login) ปลอดภัย, insert ข้าม tenant ถูกกัน, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
