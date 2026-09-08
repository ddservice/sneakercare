#!/usr/bin/env node
/**
 * ย้ายสลิปเงินเดือนและข้อมูลห้องเช่าจาก `sc_opex` เข้าตารางของตัวเอง — ขั้นที่ 5 ของ
 * docs/sc-opex-refactor-plan.md
 *
 * ⚠️ **ไม่ลบหรือแก้อะไรใน `sc_opex` เลย** — คัดลอกอย่างเดียว ระบบเดิม (GAS) ยังใช้ของเดิมอยู่
 *
 * ที่มาของข้อมูล (คีย์ใน sc_opex ที่เอาชื่อคนมาต่อท้าย):
 *   emp_<ชื่อ>                  → net_pay          (category "ค่าแรงพนักงาน")
 *   empd_base_sal_<ชื่อ>        → base_salary
 *   empd_diligence_<ชื่อ>       → diligence
 *   empd_ot_<ชื่อ>              → ot
 *   empd_comm_pct_<ชื่อ>        → commission_pct
 *   empd_wht_<ชื่อ>             → wht
 *   empd_deduct_total_<ชื่อ>    → deduction_total
 *   empd_deduct_items_<ชื่อ>    → รายการหักรูปแบบใหม่ {name, amount}
 *   empd_deduct_json_<ชื่อ>     → รายการหักรูปแบบเก่า {type, detail, minutes, rate, amount}
 *   room_prev_meter_<i> / room_curr_meter_<i> / room_rent_saved_<i> / room_income_<i>
 *
 * ⚠️ ต้องแยก prefix จาก "ชื่อคน" ให้ถูก: `empd_deduct_total_` กับ `empd_deduct_json_`
 * และ `empd_deduct_items_` ขึ้นต้นเหมือนกัน ต้องจับตัวยาวที่สุดก่อนเสมอ ไม่งั้นชื่อคนจะกลายเป็น
 * "total_สมชาย" (บั๊กแบบนี้เคยเกิดจริงตอนทำหน้า /roster — ดู CLAUDE.md ข้อ 10 ของ 2026-08-31)
 *
 * รัน: node scripts/backfill-payslips-rentals.mjs          ← ดูอย่างเดียว
 *      node scripts/backfill-payslips-rentals.mjs --apply  ← ลงมือจริง
 * รันซ้ำได้ปลอดภัย: unique (month, employee_name) / (month, room_index) + legacy_ref
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
const baht = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 });
const num = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

// ⚠️ ลำดับสำคัญ: ตัวยาวต้องมาก่อนตัวสั้นที่ขึ้นต้นเหมือนกัน
const FIELD_PREFIXES = [
  ["empd_deduct_total_", "deduction_total"],
  ["empd_deduct_items_", "__items_new"],
  ["empd_deduct_json_", "__items_old"],
  ["empd_base_sal_", "base_salary"],
  ["empd_comm_pct_", "commission_pct"],
  ["empd_diligence_", "diligence"],
  ["empd_ot_", "ot"],
  ["empd_wht_", "wht"],
];

const { data: rows, error } = await sb.from("sc_opex").select("id, month, category, key, name, amount");
if (error) { console.error("อ่าน sc_opex ไม่สำเร็จ:", error.message); process.exit(1); }

// ── รวบรวมสลิป ─────────────────────────────────────────────────────────────
/** key = "<month>|<employee>" */
const slips = new Map();
function slipFor(month, employee) {
  const k = `${month}|${employee}`;
  if (!slips.has(k)) {
    slips.set(k, {
      month, employee_name: employee, legacy_ref: k,
      base_salary: 0, diligence: 0, ot: 0, commission_pct: 0, wht: 0,
      deduction_total: 0, days_worked: 0, net_pay: 0,
      __deductions: [],
    });
  }
  return slips.get(k);
}

for (const r of rows) {
  const key = String(r.key ?? "");
  const month = String(r.month ?? "");
  if (!/^[0-9]{2}\/[0-9]{4}$/.test(month)) continue;

  if (key.startsWith("emp_")) {
    slipFor(month, key.slice(4)).net_pay = num(r.amount);
    continue;
  }
  const hit = FIELD_PREFIXES.find(([p]) => key.startsWith(p));
  if (!hit) continue;
  const [prefix, field] = hit;
  const employee = key.slice(prefix.length);
  if (!employee.trim()) continue;
  const slip = slipFor(month, employee);

  if (field === "__items_new" || field === "__items_old") {
    let items = [];
    try { items = JSON.parse(String(r.name ?? "[]")); } catch { console.error(`  ⚠️ JSON เสียที่ opex id ${r.id}`); continue; }
    if (!Array.isArray(items)) continue;
    items.forEach((it, idx) => {
      const amount = num(it?.amount);
      if (!(amount > 0)) return;
      slip.__deductions.push({
        // รูปแบบใหม่ใช้ `name` · รูปแบบเก่าใช้ `type` + `detail`
        name: String(it?.name ?? it?.type ?? "หักอื่นๆ"),
        amount,
        kind: it?.type != null ? String(it.type) : null,
        detail: it?.detail != null ? String(it.detail) : null,
        minutes: it?.minutes != null ? num(it.minutes) : null,
        rate: it?.rate != null ? num(it.rate) : null,
        legacy_ref: `${month}|${employee}|${field === "__items_old" ? "old" : "new"}-${idx}`,
      });
    });
    continue;
  }
  slip[field] = num(r.amount);
}

// ── รวบรวมห้องเช่า ─────────────────────────────────────────────────────────
const rentals = new Map();
function rentalFor(month, idx) {
  const k = `${month}|${idx}`;
  if (!rentals.has(k)) {
    rentals.set(k, { month, room_index: Number(idx), room_name: null, prev_meter: 0, curr_meter: 0, rent_amount: 0, income_amount: 0, legacy_ref: k });
  }
  return rentals.get(k);
}
const ROOM_FIELDS = [
  ["room_prev_meter_", "prev_meter"],
  ["room_curr_meter_", "curr_meter"],
  ["room_rent_saved_", "rent_amount"],
  ["room_income_", "income_amount"],
];
for (const r of rows) {
  const key = String(r.key ?? "");
  const month = String(r.month ?? "");
  if (!/^[0-9]{2}\/[0-9]{4}$/.test(month)) continue;
  const hit = ROOM_FIELDS.find(([p]) => key.startsWith(p));
  if (!hit) continue;
  const [prefix, field] = hit;
  const idx = key.slice(prefix.length);
  if (!/^\d+$/.test(idx)) continue;
  const rec = rentalFor(month, idx);
  rec[field] = num(r.amount);
  // ชื่อห้องอยู่หลัง ":" ของ name เช่น "รายรับห้องเช่า: ชั้น 3 ห้อง 1"
  const nm = String(r.name ?? "");
  const after = nm.includes(":") ? nm.slice(nm.indexOf(":") + 1).trim() : "";
  if (after && !rec.room_name) rec.room_name = after;
}

// ── สรุป ───────────────────────────────────────────────────────────────────
const slipList = [...slips.values()];
const rentalList = [...rentals.values()];
const totalNet = slipList.reduce((a, s) => a + s.net_pay, 0);
const totalIncome = rentalList.reduce((a, r) => a + r.income_amount, 0);
const totalDeductions = slipList.reduce((a, s) => a + s.__deductions.length, 0);

console.log(`\nโหมด: ${APPLY ? "ลงมือจริง" : "ดูอย่างเดียว (ใส่ --apply เพื่อลงมือจริง)"}`);
console.log(`\nสลิปเงินเดือน ${slipList.length} ใบ · รายการหัก ${totalDeductions} รายการ · ยอดจ่ายสุทธิรวม ${baht(totalNet)}`);
console.log(`ห้องเช่า ${rentalList.length} แถว · รายรับรวม ${baht(totalIncome)}`);

const people = [...new Set(slipList.map((s) => s.employee_name))];
console.log(`\nพนักงานที่พบ ${people.length} คน: ${people.join(" | ")}`);

console.log("\nเดือน      สลิป  ยอดจ่ายสุทธิ      ห้องเช่า  รายรับห้อง");
const months = [...new Set([...slipList.map((s) => s.month), ...rentalList.map((r) => r.month)])]
  .sort((a, b) => {
    const [ma, ya] = a.split("/"); const [mb, yb] = b.split("/");
    return `${ya}${ma}` < `${yb}${mb}` ? -1 : 1;
  });
for (const m of months) {
  const s = slipList.filter((x) => x.month === m);
  const r = rentalList.filter((x) => x.month === m);
  console.log(
    `  ${m}   ${String(s.length).padStart(2)}  ${baht(s.reduce((a, x) => a + x.net_pay, 0)).padStart(13)}` +
    `        ${String(r.length).padStart(2)}  ${baht(r.reduce((a, x) => a + x.income_amount, 0)).padStart(11)}`
  );
}

// ⚠️ ห้ามใช้ process.exit() ที่นี่ — libuv จะ abort ด้วย "Assertion failed: !(handle->flags &
// UV_HANDLE_CLOSING)" แล้วคืน exit code 127 ทั้งที่ทำงานสำเร็จ (เจอจริงบน Node 24 / Windows
// ดู CLAUDE.md 2026-09-06 ข้อ 4) — ใช้ if ครอบส่วนที่เขียนจริงแทน
if (!APPLY) {
  console.log("\n(ยังไม่ได้เขียนอะไรลงฐานข้อมูล)");
} else {

// ── ลงมือจริง ──────────────────────────────────────────────────────────────
const { data: existingSlips } = await sb.from("sc_payslips").select("id, legacy_ref");
const doneSlips = new Map((existingSlips ?? []).map((s) => [String(s.legacy_ref), s.id]));

let slipsInserted = 0, deductionsInserted = 0, failed = 0;
for (const slip of slipList) {
  const { __deductions, ...payload } = slip;
  let payslipId = doneSlips.get(slip.legacy_ref);
  if (!payslipId) {
    const { data, error: e } = await sb.from("sc_payslips").insert(payload).select("id").maybeSingle();
    if (e) { console.error(`  ✗ สลิป ${slip.legacy_ref}: ${e.message}`); failed++; continue; }
    payslipId = data.id;
    slipsInserted++;
  }
  for (const d of __deductions) {
    const { error: de } = await sb.from("sc_payslip_deductions").insert({ ...d, payslip_id: payslipId });
    if (de) {
      if (de.code !== "23505") { console.error(`  ✗ รายการหัก ${d.legacy_ref}: ${de.message}`); failed++; }
      continue;
    }
    deductionsInserted++;
  }
}

let rentalsInserted = 0;
for (let i = 0; i < rentalList.length; i += 100) {
  const chunk = rentalList.slice(i, i + 100);
  const { error: e } = await sb.from("sc_rental_records").upsert(chunk, { onConflict: "legacy_ref" });
  if (e) { console.error(`  ✗ ห้องเช่าก้อนที่ ${i / 100 + 1}: ${e.message}`); failed++; }
  else rentalsInserted += chunk.length;
}

console.log(`\nสลิปใหม่ ${slipsInserted} ใบ · รายการหักใหม่ ${deductionsInserted} · ห้องเช่า ${rentalsInserted} แถว · ล้มเหลว ${failed}`);
console.log("ต่อไป: node scripts/check-payroll-mirror.mjs");
process.exitCode = failed === 0 ? 0 : 1;
}
