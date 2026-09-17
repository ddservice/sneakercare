#!/usr/bin/env node
/**
 * รัน migration 0035 (ปิดช่องโหว่ฉุกเฉิน extension_layer) ผ่าน PGlite
 *
 * บริบท: extension_layer ถูก expose ให้ PostgREST เข้าถึงได้เป็นครั้งแรก 2026-09-17 (ก่อนหน้านี้
 * ปิดสนิทมาตลอดเพราะไม่อยู่ใน Exposed schemas) แต่ RLS ปิดอยู่ทุกตาราง + anon มี SELECT +
 * authenticated มีสิทธิ์เขียน/ลบเต็ม (ตกค้างมาจาก GRANT ของ 0009 ที่ไม่เคยมีผลจริงมาก่อน)
 * ⇒ ต้องปิดฉุกเฉินก่อนเริ่มงาน tenant_id เต็มรูปแบบ
 *
 * สิ่งที่ตรวจ:
 *   1. รันได้จริง และรันซ้ำได้ (idempotent)
 *   2. ทุกตารางใน extension_layer เปิด RLS แล้ว
 *   3. authenticated อ่าน/เขียนไม่ได้เลย (0 policy = deny-all) แม้จะมีแถวจริงอยู่ในตาราง
 *   4. service_role (bypass RLS) ยังอ่าน/เขียนได้ปกติ — แอปไม่พัง
 *
 * รัน: npm run test:migration
 */

import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql0035 = fs.readFileSync(path.join(root, "supabase/migrations/0035_extension_layer_lockdown.sql"), "utf8");

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
async function actAs(role) {
  await db.exec(`set role ${role}`);
}
async function actAsOwner() {
  await db.exec(`reset role`);
}

console.log("\n[1] เตรียมสภาพแวดล้อมจำลอง (extension_layer แบบก่อน 0035 — RLS ปิด, anon/authenticated มีสิทธิ์เต็ม)");
await shouldSucceed(
  "สร้าง role + schema extension_layer + ตารางตัวแทน (ext_documents) แบบก่อน 0035",
  `
  create role anon;
  create role authenticated;
  create schema extension_layer;
  create table extension_layer.ext_documents (id uuid primary key default gen_random_uuid(), doc_number text);
  grant all on all tables in schema extension_layer to authenticated;
  grant select on all tables in schema extension_layer to anon;
  grant usage on schema extension_layer to authenticated, anon;
  insert into extension_layer.ext_documents (doc_number) values ('REAL-ROW-1');
  `
);

console.log("\n[2] รัน migration 0035");
await shouldSucceed("รันไฟล์ทั้งไฟล์", sql0035);
await shouldSucceed("รันซ้ำอีกรอบได้โดยไม่พัง (idempotent)", sql0035);

console.log("\n[3] ทุกตารางเปิด RLS แล้ว");
{
  const r = await db.query(`
    select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'extension_layer' and c.relname = 'ext_documents'
  `);
  check(r.rows[0]?.relrowsecurity === true, "ext_documents เปิด RLS แล้ว", `ได้ ${JSON.stringify(r.rows)}`);
}

console.log("\n[4] authenticated อ่าน/เขียนไม่ได้เลย แม้มีแถวจริงอยู่ในตาราง (0 policy = deny-all)");
await actAs("authenticated");
{
  const r = await db.query(`select * from extension_layer.ext_documents`);
  check(r.rows.length === 0, "authenticated SELECT เห็น 0 แถว ทั้งที่มีแถวจริงอยู่ 1 แถว", `เห็น ${r.rows.length} แถว — รั่ว!`);
}
try {
  await db.exec(`insert into extension_layer.ext_documents (doc_number) values ('HACK')`);
  bad("authenticated INSERT ควรถูกปฏิเสธ แต่กลับสำเร็จ — ช่องโหว่จริง!");
} catch (e) {
  ok(`authenticated INSERT ถูกปฏิเสธจริง → ${e.message.split("\n")[0]}`);
}
await actAsOwner();

console.log("\n[5] anon ไม่มีสิทธิ์แตะตารางนี้เลยตั้งแต่ระดับ GRANT");
await actAs("anon");
try {
  await db.query(`select * from extension_layer.ext_documents`);
  bad("anon SELECT ควรถูกปฏิเสธตั้งแต่ระดับ GRANT แต่กลับสำเร็จ — ช่องโหว่จริง!");
} catch (e) {
  ok(`anon SELECT ถูกปฏิเสธจริง → ${e.message.split("\n")[0]}`);
}
await actAsOwner();

console.log("\n[6] service_role (จำลองด้วย owner/superuser ที่ bypass RLS) ยังอ่าน/เขียนได้ปกติ — แอปไม่พัง");
{
  const r = await db.query(`select doc_number from extension_layer.ext_documents`);
  check(
    r.rows.length === 1 && r.rows[0]?.doc_number === "REAL-ROW-1",
    "owner (แทน service_role) ยังเห็นแถวจริงได้ปกติ",
    `ได้ ${JSON.stringify(r.rows)}`
  );
}

await db.close();

console.log(
  failures === 0
    ? `\n✅ migration 0035 ผ่านทุกข้อ — extension_layer ปิดสนิทสำหรับ anon/authenticated แล้ว service_role ยังใช้งานได้ปกติ`
    : `\n❌ พบ ${failures} ข้อที่ไม่ผ่าน`
);
process.exitCode = failures === 0 ? 0 : 1;
