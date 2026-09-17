#!/usr/bin/env node
/**
 * รัน migration 0036 (tenant_id ให้ ext_* ที่แอปใช้จริง + RLS จริงแทน deny-all ของ 0035) ผ่าน PGlite
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. tenant_id ถูกเพิ่มให้ครบทั้ง 6 ตารางที่แอปใช้จริง
 *   3. doc_number ไม่ชนกันข้าม tenant แล้ว (เดิม UNIQUE เดี่ยวทั้งระบบ)
 *   4. fn_generate_document_number() แยกตัวนับต่อ tenant จริง (ไม่สานต่อเลขของอีก tenant)
 *      และปฏิเสธถ้าไม่ส่ง tenant_id
 *   5. RLS: admin ของ tenant ตัวเองอ่าน/เขียน ext_documents ได้ แต่ข้าม tenant ไม่ได้เลย
 *   6. ext_staged_expenses: staff อ่านได้แต่เขียนไม่ได้ (ตรงกับ lib/permissions.ts โมดูล expenses)
 *   7. super_admin เห็นข้ามทุก tenant
 *   8. rollback คืนสภาพเดิมได้ (ไม่มีข้อมูลชนกัน)
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0036 = fs.readFileSync(path.join(root, "supabase/migrations/0036_ext_tenant_id.sql"), "utf8");
const rollback0036 = fs.readFileSync(path.join(root, "supabase/migrations/rollback/0036_rollback.sql"), "utf8");

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

console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (extension_layer แบบก่อน 0036 — deny-all ตาม 0035, ยังไม่มี tenant_id)");
await shouldSucceed(
  "สร้าง role/schema auth/public.tenants+profiles/extension_layer ตารางจริงตามรูปร่าง production",
  `
  create role anon;
  create role authenticated;
  grant all on all tables in schema public to authenticated;
  create schema if not exists auth;
  create or replace function auth.uid() returns uuid as $$
    select nullif(current_setting('test.uid', true), '')::uuid
  $$ language sql stable;

  create table public.tenants (id uuid primary key, name text not null);
  insert into public.tenants (id, name) values ('${T1}', 'SneakerCare'), ('${T2}', 'BagSpa');
  create table public.profiles (id uuid primary key, username text, role text not null, tenant_id uuid references public.tenants(id));
  insert into public.profiles (id, username, role, tenant_id) values
    ('${U_ADMIN_1}', 'admin1', 'admin', '${T1}'),
    ('${U_ADMIN_2}', 'admin2', 'co_admin', '${T2}'),
    ('${U_STAFF_1}', 'staff1', 'staff', '${T1}'),
    ('${U_SUPER}', 'super', 'super_admin', null);

  create or replace function public.inv_fn_current_role() returns text
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select case lower(replace(coalesce(p.role, ''), '_', '-'))
      when 'admin' then 'admin' when 'co-admin' then 'co-admin' when 'staff' then 'staff'
      when 'super-admin' then 'super_admin' else null end
    from public.profiles p where p.id = auth.uid()
  $fn$;
  create or replace function public.fn_current_tenant() returns uuid
  language sql stable security definer set search_path to 'public', 'pg_temp' as $fn$
    select tenant_id from public.profiles where id = auth.uid()
  $fn$;

  create schema extension_layer;
  grant usage on schema extension_layer to authenticated, anon;
  create table extension_layer.ext_documents (
    id uuid primary key default gen_random_uuid(), doc_type text, doc_number text,
    issue_date date not null default current_date, status text not null default 'DRAFT',
    subtotal_amount numeric not null default 0, grand_total numeric not null default 0,
    constraint ext_documents_doc_number_key unique (doc_number)
  );
  create table extension_layer.ext_contacts (
    id uuid primary key default gen_random_uuid(), legacy_contact_id text, company_name text not null,
    constraint ext_contacts_legacy_contact_id_key unique (legacy_contact_id)
  );
  create table extension_layer.ext_document_items (
    id uuid primary key default gen_random_uuid(), document_id uuid references extension_layer.ext_documents(id),
    item_name text not null, quantity numeric not null default 1, unit_price numeric not null default 0,
    total_line_amount numeric not null default 0
  );
  create table extension_layer.ext_billing_references (
    id uuid primary key default gen_random_uuid(), billing_note_id uuid references extension_layer.ext_documents(id),
    ref_doc_type text not null, ref_doc_number text not null, ref_date date not null,
    total_amount numeric not null default 0, balance_due numeric not null default 0
  );
  create table extension_layer.ext_staged_expenses (
    id uuid primary key default gen_random_uuid(), receipt_image_url text not null, total_amount numeric not null default 0,
    approval_status text default 'PENDING_APPROVAL'
  );
  create table extension_layer.ext_numbering_sequences (
    id uuid primary key default gen_random_uuid(), doc_type text not null, prefix text not null,
    year_month text not null, current_sequence int not null default 0,
    constraint ext_numbering_sequences_doc_type_prefix_year_month_key unique (doc_type, prefix, year_month)
  );
  create or replace function extension_layer.fn_generate_document_number(
    p_doc_type varchar, p_prefix varchar, p_date_str varchar
  ) returns varchar language plpgsql security definer set search_path to 'extension_layer', 'pg_temp' as $fn$
  declare v_seq int; begin
    insert into extension_layer.ext_numbering_sequences (doc_type, prefix, year_month, current_sequence)
    values (p_doc_type, p_prefix, p_date_str, 1)
    on conflict (doc_type, prefix, year_month) do update set current_sequence = extension_layer.ext_numbering_sequences.current_sequence + 1
    returning current_sequence into v_seq;
    return p_prefix || '-' || p_date_str || '-' || lpad(v_seq::text, 4, '0');
  end; $fn$;

  -- deny-all ตาม 0035 (owner ยัง bypass ได้ปกติเหมือน service_role จริง)
  alter table extension_layer.ext_documents enable row level security;
  alter table extension_layer.ext_contacts enable row level security;
  alter table extension_layer.ext_document_items enable row level security;
  alter table extension_layer.ext_billing_references enable row level security;
  alter table extension_layer.ext_staged_expenses enable row level security;
  alter table extension_layer.ext_numbering_sequences enable row level security;
  grant all on all tables in schema extension_layer to authenticated;
  `
);

console.log("\n[2] รัน migration 0036");
await shouldSucceed("รันไฟล์ทั้งไฟล์", sql0036);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0036);

console.log("\n[3] tenant_id ถูกเพิ่มครบทั้ง 6 ตาราง");
{
  const r = await db.query(`
    select table_name from information_schema.columns
    where table_schema = 'extension_layer' and column_name = 'tenant_id'
    order by table_name
  `);
  const names = r.rows.map((x) => x.table_name);
  const expected = ["ext_billing_references", "ext_contacts", "ext_document_items", "ext_documents", "ext_numbering_sequences", "ext_staged_expenses"];
  check(
    expected.every((e) => names.includes(e)),
    "tenant_id เพิ่มครบทั้ง 6 ตาราง",
    `ได้ ${JSON.stringify(names)}`
  );
}

console.log("\n[4] doc_number ไม่ชนกันข้าม tenant แล้ว");
await actAsOwner();
await shouldSucceed(
  "seed ext_documents ของ T1 และ T2 ด้วย doc_number เดียวกัน (INV-202609-0001)",
  `
  insert into extension_layer.ext_documents (doc_type, doc_number, tenant_id) values
    ('INVOICE', 'INV-202609-0001', '${T1}'),
    ('INVOICE', 'INV-202609-0001', '${T2}');
  `
);

console.log("\n[5] fn_generate_document_number() แยกตัวนับต่อ tenant จริง + ต้องระบุ tenant_id เสมอ");
{
  const n1 = await db.query(`select extension_layer.fn_generate_document_number('QUOTATION', 'QA', '20260901', $1) as n`, [T1]);
  const n2 = await db.query(`select extension_layer.fn_generate_document_number('QUOTATION', 'QA', '20260901', $1) as n`, [T2]);
  check(
    n1.rows[0]?.n === "QA-20260901-0001" && n2.rows[0]?.n === "QA-20260901-0001",
    `ทั้งสอง tenant ได้เลขแรกเป็น 0001 เหมือนกัน ไม่สานต่อกัน (T1: ${n1.rows[0]?.n}, T2: ${n2.rows[0]?.n})`,
    `ได้ T1: ${JSON.stringify(n1.rows)}, T2: ${JSON.stringify(n2.rows)}`
  );
  const n1b = await db.query(`select extension_layer.fn_generate_document_number('QUOTATION', 'QA', '20260901', $1) as n`, [T1]);
  check(n1b.rows[0]?.n === "QA-20260901-0002", "T1 เรียกครั้งที่สองได้เลข 0002 ต่อเนื่องของตัวเอง", `ได้ ${JSON.stringify(n1b.rows)}`);
}
await shouldFail("เรียก fn_generate_document_number โดยไม่ระบุ tenant_id (null)", async () => {
  await db.query(`select extension_layer.fn_generate_document_number('QUOTATION', 'QA', '20260901', null)`);
});

console.log("\n[6] RLS: admin ของแต่ละ tenant มองเห็นแค่ ext_documents ของตัวเอง");
await actAs(U_ADMIN_1);
{
  const r = await db.query(`select tenant_id from extension_layer.ext_documents`);
  const tenants = new Set(r.rows.map((x) => x.tenant_id));
  check(tenants.size === 1 && tenants.has(T1), "admin1 (T1) เห็นแค่แถวของ T1", `เห็น ${JSON.stringify([...tenants])}`);
}
await shouldFail("admin1 (T1) insert ext_documents ข้าม tenant ไปที่ T2", async () => {
  await db.query(`insert into extension_layer.ext_documents (doc_type, doc_number, tenant_id) values ('INVOICE', 'HACK-1', $1)`, [T2]);
});

console.log("\n[7] ext_staged_expenses: staff อ่านได้ แต่เขียนไม่ได้ (ตรงกับโมดูล expenses)");
await actAsOwner();
await db.exec(`insert into extension_layer.ext_staged_expenses (receipt_image_url, total_amount, tenant_id) values ('x.jpg', 100, '${T1}')`);
await actAs(U_STAFF_1);
{
  const r = await db.query(`select id from extension_layer.ext_staged_expenses`);
  check(r.rows.length === 1, "staff1 อ่าน ext_staged_expenses ของ tenant ตัวเองได้", `ได้ ${r.rows.length} แถว`);
}
await shouldFail("staff1 insert ext_staged_expenses ใหม่ (ต้องเป็น admin/co-admin เท่านั้น)", async () => {
  await db.query(`insert into extension_layer.ext_staged_expenses (receipt_image_url, total_amount, tenant_id) values ('y.jpg', 50, '${T1}')`);
});

console.log("\n[8] super_admin เห็นข้ามทุก tenant");
await actAs(U_SUPER);
{
  const r = await db.query(`select tenant_id from extension_layer.ext_documents`);
  const tenants = new Set(r.rows.map((x) => x.tenant_id));
  check(tenants.has(T1) && tenants.has(T2), "super_admin เห็น ext_documents ทั้ง T1 และ T2", `เห็น ${JSON.stringify([...tenants])}`);
}

console.log("\n[9] rollback คืนสภาพเดิม (ลบแถวที่จะชนกันก่อน)");
await actAsOwner();
await db.exec(`delete from extension_layer.ext_documents where doc_number = 'INV-202609-0001' and tenant_id = '${T2}'`);
// ext_numbering_sequences ของ T1/T2 ก็ชื่อ (doc_type, prefix, year_month) เดียวกันจากขั้นตอน [5]
// (แยกกันได้เพราะมี tenant_id คนละอันในตัวนับใหม่) ต้องลบฝั่งใดฝั่งหนึ่งก่อน ไม่งั้น UNIQUE เดี่ยว
// เดิมที่ rollback จะคืนกลับมาชนกันทันทีเหมือน ext_documents ข้างบน
await db.exec(`delete from extension_layer.ext_numbering_sequences where tenant_id = '${T2}'`);
await shouldSucceed("รัน rollback ผ่าน", rollback0036);
{
  const r = await db.query(`select column_name from information_schema.columns where table_schema='extension_layer' and table_name='ext_documents' and column_name='tenant_id'`);
  check(r.rows.length === 0, "tenant_id ถูกลบออกจาก ext_documents แล้วหลัง rollback", `ยังพบคอลัมน์อยู่`);
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0036 ผ่านทุกข้อ — ext_* แยก tenant ได้จริง, เลขที่เอกสารไม่ชนกันข้าม tenant, RLS กรอง tenant ถูกต้อง, rollback สะอาด`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
