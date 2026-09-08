#!/usr/bin/env node
/**
 * เทียบเงินเดือนและห้องเช่าระหว่าง `sc_opex` (แหล่งข้อมูลจริงตอนนี้) กับตารางใหม่
 * `sc_payslips` / `sc_payslip_deductions` / `sc_rental_records` — ขั้นที่ 5 ของ
 * docs/sc-opex-refactor-plan.md
 *
 * ⚠️ ทำไมต้องเทียบทีละแถว ไม่ใช่แค่ยอดรวม: ยอดรวมที่บังเอิญเท่ากันปิดบังการจับคู่ผิดได้
 * และการแยก prefix ออกจากชื่อคน (`empd_deduct_total_` vs `empd_deduct_json_`) เป็นจุดที่
 * เคยพลาดมาแล้วจริงจนชื่อพนักงานกลายเป็น "total_สมชาย"
 *
 * รัน: node scripts/check-payroll-mirror.mjs  · อ่านอย่างเดียว ไม่เขียนอะไรทั้งสิ้น
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
const num = (v) => { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; };

const [{ data: opex }, { data: slips }, { data: rentals }, { data: deductions }] = await Promise.all([
  sb.from("sc_opex").select("id, month, category, key, name, amount"),
  sb.from("sc_payslips").select("id, month, employee_name, net_pay, base_salary, deduction_total"),
  sb.from("sc_rental_records").select("month, room_index, room_name, income_amount, rent_amount"),
  sb.from("sc_payslip_deductions").select("id, payslip_id, name, amount"),
]);

let failures = 0;
const fail = (m) => { console.log(`  ✗ ${m}`); failures++; };

// ── เงินเดือน: แถว emp_<ชื่อ> ใน sc_opex ต้องมีสลิปคู่กันที่ยอดตรง ──────────
const slipByRef = new Map(slips.map((s) => [`${s.month}|${s.employee_name}`, s]));
const empRows = opex.filter((r) => String(r.key ?? "").startsWith("emp_") && /^[0-9]{2}\/[0-9]{4}$/.test(String(r.month)));

let matched = 0;
const missing = [];
const mismatched = [];
for (const r of empRows) {
  const ref = `${r.month}|${String(r.key).slice(4)}`;
  const s = slipByRef.get(ref);
  if (!s) { missing.push(ref); continue; }
  if (Math.abs(num(s.net_pay) - num(r.amount)) > 0.005) mismatched.push({ ref, opex: num(r.amount), slip: num(s.net_pay) });
  else matched++;
}
const orphanSlips = slips.filter((s) => !empRows.some((r) => `${r.month}|${String(r.key).slice(4)}` === `${s.month}|${s.employee_name}`));

console.log("\n── เงินเดือน ──");
console.log(`  แถว emp_* ใน sc_opex        ${String(empRows.length).padStart(3)} แถว  ${baht(empRows.reduce((a, r) => a + num(r.amount), 0)).padStart(13)}`);
console.log(`  สลิปในตารางใหม่             ${String(slips.length).padStart(3)} ใบ   ${baht(slips.reduce((a, s) => a + num(s.net_pay), 0)).padStart(13)}`);
console.log(`  จับคู่ได้และยอดตรงกัน        ${String(matched).padStart(3)} ใบ`);
console.log(`  รายการหักที่ย้ายมาแล้ว       ${String(deductions.length).padStart(3)} รายการ`);
if (missing.length) fail(`ยังไม่มีสลิปคู่กัน ${missing.length} รายการ: ${missing.slice(0, 5).join(", ")}`);
if (mismatched.length) for (const m of mismatched) fail(`ยอดไม่ตรง ${m.ref}: sc_opex ${baht(m.opex)} vs สลิป ${baht(m.slip)}`);
if (orphanSlips.length) fail(`สลิปที่ไม่มีต้นทางใน sc_opex ${orphanSlips.length} ใบ: ${orphanSlips.slice(0, 5).map((s) => `${s.month}|${s.employee_name}`).join(", ")}`);

// ── ห้องเช่า: รายรับรายเดือนต้องเท่ากันทั้งสองฝั่ง ──────────────────────────
console.log("\n── ห้องเช่า (รายรับรายเดือน) ──");
const incomeByMonthOld = {};
for (const r of opex) {
  if (String(r.category) !== "rental_income") continue;
  const m = String(r.month ?? "");
  if (!/^[0-9]{2}\/[0-9]{4}$/.test(m)) continue;
  incomeByMonthOld[m] = (incomeByMonthOld[m] || 0) + num(r.amount);
}
const incomeByMonthNew = {};
for (const r of rentals) incomeByMonthNew[r.month] = (incomeByMonthNew[r.month] || 0) + num(r.income_amount);

const monthsAll = [...new Set([...Object.keys(incomeByMonthOld), ...Object.keys(incomeByMonthNew)])].sort((a, b) => {
  const [ma, ya] = a.split("/"); const [mb, yb] = b.split("/");
  return `${ya}${ma}` < `${yb}${mb}` ? -1 : 1;
});
for (const m of monthsAll) {
  const o = incomeByMonthOld[m] || 0;
  const n = incomeByMonthNew[m] || 0;
  const same = Math.abs(o - n) < 0.005;
  if (!same) failures++;
  console.log(`  ${m}  ${baht(o).padStart(12)}  ${baht(n).padStart(12)}  ${same ? "✓" : "✗"}`);
}

console.log(
  failures === 0
    ? "\n✅ เงินเดือนและห้องเช่าตรงกันทั้งสองฝั่งทุกแถว"
    : `\n❌ พบปัญหา ${failures} จุด`
);
process.exitCode = failures === 0 ? 0 : 1;
