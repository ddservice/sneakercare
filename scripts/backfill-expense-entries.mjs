#!/usr/bin/env node
/**
 * ย้ายค่าใช้จ่ายเดิมจาก `sc_opex` เข้า `sc_expense_entries` — ขั้นที่ 3 ของ
 * docs/sc-opex-refactor-plan.md
 *
 * ⚠️ **ไม่ลบหรือแก้อะไรใน `sc_opex` เลย** — `sc_opex` ยังเป็นแหล่งข้อมูลจริงและระบบเดิม
 * (Google Apps Script) ยังอ่าน/เขียนมันอยู่ สคริปต์นี้ "คัดลอก" อย่างเดียว
 *
 * ขอบเขต = **เฉพาะฝั่ง OPEX** ให้ตรงกับที่ `calculateExpenseBreakdown().totalOpex` นับ:
 *   นับ    : ทุกแถวที่ `isOpexRow()` เป็นจริง + รายการย่อยใน `misc_items_json`
 *   ไม่นับ : แถวสรุป `key='misc'` (ซ้ำกับรายการย่อย) · `emp_*` (เงินเดือน → ขั้นที่ 5)
 *            · `empd_*` (ข้อมูลสลิป) · `room_*` (ห้องเช่า → ขั้นที่ 5) · `audit_log`
 *            · category `rental_income` / `rental_meter` / `payslip_detail`
 *
 * ⚠️ **เงินเดือนยังอยู่ที่ `sc_opex` เท่านั้น** จนกว่าจะถึงขั้นที่ 5 — ตอนสลับการอ่าน
 * (ขั้นที่ 4) ต้องเอา opex จากตารางใหม่ + payroll จาก `sc_opex` มารวมกัน
 *
 * `entry_date` ใช้วันที่ 1 ของเดือนเสมอ เพราะ `sc_opex` เก็บแค่ "MM/YYYY" ไม่มีวันจริง
 * (ทุกรายงานในระบบเป็นรายเดือน จึงไม่กระทบตัวเลข) — เขียนกำกับไว้ในคอลัมน์ `note`
 *
 * รัน: node scripts/backfill-expense-entries.mjs          ← ดูอย่างเดียว
 *      node scripts/backfill-expense-entries.mjs --apply  ← ลงมือจริง
 * รันซ้ำได้ปลอดภัย: `legacy_ref` เป็น unique index กันการนับซ้ำที่ระดับฐานข้อมูล
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const APPLY = process.argv.includes("--apply");

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

// ใช้ตัวจริงที่หน้าเว็บใช้ ไม่ใช่สำเนากฎที่ลอกมา — ถ้ากฎเปลี่ยน backfill ต้องเปลี่ยนตาม
const { isOpexRow, MISC_ITEMS_KEY, isUsableAmount } = await import(
  new URL("../.test-build/expense-totals.js", import.meta.url).href
);
const { categoryKeyFor } = await import(
  new URL("../.test-build/expense-categories.js", import.meta.url).href
);

const baht = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });

/** "MM/YYYY" → "YYYY-MM-01" */
function firstOfMonth(monthMY) {
  const [mm, yyyy] = String(monthMY ?? "").split("/");
  if (!mm || !yyyy) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-01`;
}

const { data: rows, error } = await sb.from("sc_opex").select("id, month, category, key, name, amount, pay_method");
if (error) {
  console.error("อ่าน sc_opex ไม่สำเร็จ:", error.message);
  process.exit(1);
}

// ── สร้างรายการที่จะย้าย ────────────────────────────────────────────────────
const planned = [];
const skippedNoDate = [];

for (const r of rows) {
  const entryDate = firstOfMonth(r.month);

  if (r.key === MISC_ITEMS_KEY && r.name) {
    let items = [];
    try { items = JSON.parse(String(r.name)); } catch { console.error(`  ⚠️ JSON เสียที่ opex id ${r.id}`); continue; }
    if (!Array.isArray(items)) continue;
    items.forEach((it, idx) => {
      const amount = Number(it?.amount ?? 0);
      if (!isUsableAmount(amount)) return;
      const title = String(it?.name ?? "อื่นๆ");
      if (!entryDate) { skippedNoDate.push({ ref: `${r.id}-misc-${idx}`, title, amount }); return; }
      planned.push({
        legacy_ref: `${r.id}-misc-${idx}`,
        legacy_opex_id: null, // ใช้ไม่ได้ — แถวเดียวมีค่าใช้จ่ายหลายรายการ (ดู migration 0025)
        entry_date: entryDate,
        amount,
        category: categoryKeyFor("", title),
        title,
        pay_method: String(it?.method ?? "บัญชีร้าน"),
        note: `backfill จาก sc_opex id ${r.id} (misc_items_json #${idx}) · ไม่มีวันที่จริง ใช้วันที่ 1 ของเดือน`,
      });
    });
    continue;
  }

  if (!isOpexRow(r) || !isUsableAmount(r.amount)) continue;
  const title = String(r.name ?? "").trim() || String(r.key ?? "ค่าใช้จ่าย");
  if (!entryDate) { skippedNoDate.push({ ref: String(r.id), title, amount: Number(r.amount) }); continue; }
  planned.push({
    legacy_ref: String(r.id),
    legacy_opex_id: Number(r.id),
    entry_date: entryDate,
    amount: Number(r.amount),
    category: categoryKeyFor(String(r.category ?? ""), title),
    title,
    pay_method: String(r.pay_method || "บัญชีร้าน"),
    note: `backfill จาก sc_opex id ${r.id} · ไม่มีวันที่จริง ใช้วันที่ 1 ของเดือน`,
  });
}

// ── ตัดรายการที่ย้ายไปแล้วออก ───────────────────────────────────────────────
const { data: existing } = await sb.from("sc_expense_entries").select("legacy_ref");
const done = new Set((existing ?? []).map((e) => String(e.legacy_ref)).filter(Boolean));
const todo = planned.filter((p) => !done.has(p.legacy_ref));

// ── สรุปก่อนลงมือ ───────────────────────────────────────────────────────────
const byMonth = {};
for (const p of planned) {
  const m = p.entry_date.slice(0, 7);
  byMonth[m] = (byMonth[m] || 0) + p.amount;
}
console.log(`\nโหมด: ${APPLY ? "ลงมือจริง" : "ดูอย่างเดียว (ใส่ --apply เพื่อลงมือจริง)"}`);
console.log(`\nรายการที่เข้าข่ายทั้งหมด ${planned.length} รายการ · ย้ายไปแล้ว ${planned.length - todo.length} · เหลือ ${todo.length}`);
console.log("\nเดือน      ยอด OPEX ที่จะย้าย");
for (const m of Object.keys(byMonth).sort()) console.log(`  ${m}   ${baht(byMonth[m]).padStart(14)}`);
console.log(`  รวม      ${baht(Object.values(byMonth).reduce((a, b) => a + b, 0)).padStart(14)}`);

const byCategory = {};
for (const p of planned) byCategory[p.category] = (byCategory[p.category] || 0) + p.amount;
console.log("\nแยกตามหมวด:");
for (const [k, v] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${baht(v).padStart(14)}`);
}

if (skippedNoDate.length) {
  console.log(`\n⚠️ ข้าม ${skippedNoDate.length} รายการที่แปลงเดือนไม่ได้:`);
  for (const s of skippedNoDate) console.log(`   ${s.ref} ${s.title} ${baht(s.amount)}`);
}

// ⚠️ ห้ามใช้ process.exit() ที่นี่ — libuv จะ abort ด้วย "Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)" แล้วคืน exit code 127 ทั้งที่ทำงานสำเร็จ (เจอจริงบน Node 24 / Windows
// ดู CLAUDE.md 2026-09-06 ข้อ 4) — ใช้ if ครอบส่วนที่เขียนจริงแทน
if (!APPLY) {
  console.log("\n(ยังไม่ได้เขียนอะไรลงฐานข้อมูล)");
} else {

// ── ลงมือจริง — ทีละก้อน 100 แถว ───────────────────────────────────────────
let inserted = 0;
let failed = 0;
for (let i = 0; i < todo.length; i += 100) {
  const chunk = todo.slice(i, i + 100);
  const { error: insErr } = await sb.from("sc_expense_entries").insert(chunk);
  if (insErr) {
    // ถ้าก้อนล้ม ลองทีละแถวเพื่อให้รู้ว่าแถวไหนมีปัญหา แทนที่จะล้มทั้งก้อนเงียบๆ
    for (const one of chunk) {
      const { error: oneErr } = await sb.from("sc_expense_entries").insert(one);
      if (oneErr) { console.error(`  ✗ ${one.legacy_ref} ${one.title}: ${oneErr.message}`); failed++; }
      else inserted++;
    }
  } else {
    inserted += chunk.length;
  }
}
console.log(`\nเขียนสำเร็จ ${inserted} แถว · ล้มเหลว ${failed} แถว`);
console.log("ต่อไป: npm run check:expense-mirror แล้ว npm run test:reconcile");
process.exitCode = failed === 0 ? 0 : 1;
}
