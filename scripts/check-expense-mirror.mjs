#!/usr/bin/env node
/**
 * เทียบ `sc_opex` (แหล่งข้อมูลจริงตอนนี้) กับ `sc_expense_entries` (ตารางใหม่)
 * ระหว่างช่วง "เขียนสองที่" — ขั้นที่ 2 ของ docs/sc-opex-refactor-plan.md
 *
 * ⚠️ ทำไมต้องมี: การย้ายข้อมูลเงินที่ "ดูเหมือนจะถูก" คือวิธีที่บั๊กเงินทุกตัวในระบบนี้เกิดขึ้น
 * ตัวเลขขาด/เกินเงียบๆ ไม่มี error ให้เห็น — สคริปต์นี้เทียบ **ทีละแถว** ไม่ใช่แค่ยอดรวม
 * เพราะยอดรวมที่บังเอิญเท่ากันปิดบังการจับคู่ผิดได้
 *
 * แถวที่นับ: `sc_opex` ที่ `key` ขึ้นต้นด้วย `custom_` เท่านั้น = รายการที่ผู้ใช้กรอกผ่าน
 * ฟอร์ม "เพิ่มรายจ่าย" ซึ่งเป็นขอบเขตของขั้นที่ 2 (เงินเดือน/ห้องเช่า/รายการย่อยใน JSON
 * ยังไม่เข้าข่าย — จะย้ายในขั้นที่ 3 และ 5)
 *
 * รัน: npm run check:expense-mirror  · อ่านอย่างเดียว ไม่เขียนอะไรทั้งสิ้น
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadEnv() {
  const out = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    if (!line.includes("=") || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const baht = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

const [{ data: opexRows, error: opexErr }, { data: entries, error: entErr }] = await Promise.all([
  sb.from("sc_opex").select("id, month, category, key, name, amount"),
  sb.from("sc_expense_entries").select("id, entry_date, amount, category, title, legacy_opex_id"),
]);

if (opexErr || entErr) {
  console.error("อ่านข้อมูลไม่สำเร็จ:", opexErr?.message ?? entErr?.message);
  process.exit(1);
}

// ขอบเขตของขั้นที่ 2: เฉพาะรายการที่กรอกผ่านฟอร์ม "เพิ่มรายจ่าย"
const inScope = opexRows.filter((r) => String(r.key ?? "").startsWith("custom_") && Number(r.amount || 0) > 0);
const byLegacyId = new Map(entries.filter((e) => e.legacy_opex_id != null).map((e) => [Number(e.legacy_opex_id), e]));

const matched = [];
const notMirrored = [];
const amountMismatch = [];

for (const r of inScope) {
  const e = byLegacyId.get(Number(r.id));
  if (!e) { notMirrored.push(r); continue; }
  if (Math.abs(Number(e.amount) - Number(r.amount)) > 0.005) amountMismatch.push({ r, e });
  else matched.push(r);
}

// แถวในตารางใหม่ที่ชี้กลับไปหาแถวที่ไม่มีอยู่แล้ว = กระจกเงาค้าง (อันตรายกว่าแถวที่ยังไม่ mirror
// เพราะถ้าขั้นที่ 4 สลับไปอ่านตารางใหม่ ยอดจะเกินจริงทันที)
const opexIds = new Set(opexRows.map((r) => Number(r.id)));
const orphans = entries.filter((e) => e.legacy_opex_id != null && !opexIds.has(Number(e.legacy_opex_id)));

console.log("\n── สรุปการเทียบสองฝั่ง (เฉพาะรายการจากฟอร์ม 'เพิ่มรายจ่าย') ──");
console.log(`  sc_opex ที่อยู่ในขอบเขต   ${String(inScope.length).padStart(4)} แถว  ${baht(inScope.reduce((a, r) => a + Number(r.amount || 0), 0)).padStart(14)}`);
console.log(`  จับคู่ได้และยอดตรงกัน       ${String(matched.length).padStart(4)} แถว`);
console.log(`  ยังไม่มีกระจกเงา            ${String(notMirrored.length).padStart(4)} แถว  ${baht(notMirrored.reduce((a, r) => a + Number(r.amount || 0), 0)).padStart(14)}`);
console.log(`  ยอดไม่ตรงกัน                ${String(amountMismatch.length).padStart(4)} แถว`);
console.log(`  กระจกเงาค้าง (ต้นทางหายแล้ว) ${String(orphans.length).padStart(3)} แถว`);

if (amountMismatch.length) {
  console.log("\n⚠️ ยอดไม่ตรงกัน:");
  for (const { r, e } of amountMismatch) console.log(`   opex id ${r.id} = ${baht(r.amount)} แต่ entry id ${e.id} = ${baht(e.amount)}`);
}
if (orphans.length) {
  console.log("\n⚠️ กระจกเงาค้าง (ต้นทางใน sc_opex ถูกลบไปแล้ว):");
  for (const e of orphans) console.log(`   entry id ${e.id} → legacy_opex_id ${e.legacy_opex_id} (${e.title} ${baht(e.amount)})`);
}
if (notMirrored.length) {
  const oldest = notMirrored.slice(0, 5);
  console.log("\nℹ️ ยังไม่มีกระจกเงา — ปกติสำหรับแถวที่บันทึกไว้ก่อนเปิด dual-write");
  console.log("   จะหายไปเองหลังทำขั้นที่ 3 (backfill) ตัวอย่าง:");
  for (const r of oldest) console.log(`   opex id ${r.id} ${r.month} ${String(r.name).slice(0, 34)} ${baht(r.amount)}`);
  if (notMirrored.length > oldest.length) console.log(`   … และอีก ${notMirrored.length - oldest.length} แถว`);
}

// ล้มเหลวเฉพาะกรณีที่ "ผิดจริง" — แถวที่ยังไม่ backfill ไม่ถือว่าผิดในขั้นที่ 2
const failures = amountMismatch.length + orphans.length;
console.log(
  failures === 0
    ? "\n✅ ไม่มีการจับคู่ผิดหรือกระจกเงาค้าง"
    : `\n❌ พบปัญหา ${failures} จุด — ต้องแก้ก่อนขึ้นขั้นที่ 3`
);
process.exitCode = failures === 0 ? 0 : 1;
