#!/usr/bin/env node
/**
 * ตาข่ายนิรภัยของตัวเลขเงิน — ยืนยันว่ากำไรสุทธิรายเดือนบน production ยังตรงกับ Excel
 * ที่เจ้าของกระทบยอดด้วยมือแล้วทุกบาท
 *
 * ⚠️ ทำไมต้องมี (ขั้น 0 ของ docs/sc-opex-refactor-plan.md): แผนแตก `sc_opex` จะแตะข้อมูลเงิน
 * จริงหลายขั้น ถ้าไม่มีตัวเลขอ้างอิงที่ "ถูกยืนยันโดยมนุษย์" คอยเทียบทุกขั้น จะไม่มีทางรู้ว่า
 * ขั้นไหนทำยอดเพี้ยน — และบั๊กเงินในระบบนี้ทุกตัวที่ผ่านมาเป็น "ตัวเลขขาด/เกินเงียบๆ"
 * ไม่ใช่ error ที่มีใครเห็น
 *
 * **ค่าที่ล็อกไว้ด้านล่างห้ามแก้เพื่อให้เทสต์ผ่าน** — ถ้าเทสต์แดง แปลว่าโค้ดหรือข้อมูลเปลี่ยน
 * ไปจากที่กระทบยอดไว้ ต้องไปหาสาเหตุก่อนเสมอ จะแก้ตัวเลขอ้างอิงได้ก็ต่อเมื่อเจ้าของกระทบยอด
 * กับ Excel ใหม่แล้วยืนยันด้วยตัวเอง
 *
 * ⚠️ ไม่อยู่ใน CI เพราะอ่าน production จริง — รันเองทุกครั้งที่แตะตรรกะเงินหรือข้อมูลเงิน
 * อ่านอย่างเดียว ไม่เขียนอะไรทั้งสิ้น
 *
 * รัน: npm run test:reconcile
 */
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

/**
 * เกณฑ์รายรับที่ Excel ของแต่ละเดือนใช้
 *   accrual = ยอดตามบิลที่ออกในเดือนนั้น (ลูกค้าจ่ายแล้วหรือยังไม่สำคัญ)
 *   cash    = เงินที่เข้าจริงในเดือนนั้น
 * เดือนที่บิลถูกจ่ายครบภายในเดือน สองเกณฑ์ให้ค่าเท่ากัน จึงระบุเฉพาะเดือนที่ต่างกันจริง:
 *   07/2026 มีบิลค้าง 200 · 08/2026 มีบิล 21 ส.ค. ที่ลูกค้าโอน 1 ก.ย. 2,100
 */
const EXPECTED = [
  { month: "02/2026", basis: "accrual", profit: 3023.36 },
  { month: "03/2026", basis: "accrual", profit: -14075.62 },
  { month: "04/2026", basis: "accrual", profit: 1962.69 },
  { month: "05/2026", basis: "accrual", profit: 11066.07 },
  { month: "06/2026", basis: "accrual", profit: 14351.66 },
  { month: "07/2026", basis: "accrual", profit: 21079.52 },
  { month: "08/2026", basis: "cash", profit: 24524.79 },
];

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

// ใช้สูตรตัวจริงที่หน้าเว็บใช้ ไม่ใช่สำเนาที่ลอกมา (คอมไพล์ไว้ที่ .test-build โดย npm script)
const { calculateExpenseBreakdown } = await import(
  new URL("../.test-build/expense-totals.js", import.meta.url).href
);

/** "MM/YYYY" → ขอบเขตวันที่ของเดือนนั้น */
function bounds(monthMY) {
  const [mm, yyyy] = monthMY.split("/").map(Number);
  const pad = (n) => String(n).padStart(2, "0");
  const nextY = mm === 12 ? yyyy + 1 : yyyy;
  const nextM = mm === 12 ? 1 : mm + 1;
  return { iso: `${yyyy}-${pad(mm)}`, gte: `${yyyy}-${pad(mm)}-01`, lt: `${nextY}-${pad(nextM)}-01` };
}

const money = (n) => Number(n).toFixed(2).padStart(13);
let failures = 0;

console.log("\nเดือน      เกณฑ์     กำไรในระบบ      ที่กระทบยอดไว้        ต่าง");
console.log("─".repeat(70));

for (const exp of EXPECTED) {
  const b = bounds(exp.month);
  const [{ data: opex }, { data: sales }, { data: pays }] = await Promise.all([
    sb.from("sc_opex").select("*").eq("month", exp.month),
    sb.from("sc_sales").select("date,total_revenue,grand_total,discount,amount_paid").gte("date", b.gte).lt("date", b.lt),
    sb.from("sc_payments").select("received_date,amount"),
  ]);

  const breakdown = calculateExpenseBreakdown(opex ?? []);
  const billed = (sales ?? []).reduce(
    (a, s) => a + Number(s.total_revenue || (Number(s.grand_total || 0) - Number(s.discount || 0))),
    0
  );
  const cash =
    (sales ?? []).reduce((a, s) => a + Number(s.amount_paid ?? 0), 0) +
    (pays ?? []).filter((p) => String(p.received_date || "").startsWith(b.iso)).reduce((a, p) => a + Number(p.amount || 0), 0);

  const revenue = exp.basis === "cash" ? cash : billed;
  const profit = revenue + breakdown.totalRentalIncome - breakdown.totalExpenses;
  const diff = profit - exp.profit;
  const pass = Math.abs(diff) < 0.02;
  if (!pass) failures++;
  console.log(`${exp.month}  ${exp.basis.padEnd(8)} ${money(profit)}  ${money(exp.profit)}  ${money(diff)} ${pass ? "✓" : "✗"}`);
}

console.log("─".repeat(70));
if (failures === 0) {
  console.log(`✅ ตรงกับที่กระทบยอดไว้ครบทั้ง ${EXPECTED.length} เดือน`);
} else {
  console.log(`❌ ไม่ตรง ${failures} เดือน — อย่าเพิ่งแก้ตัวเลขอ้างอิงในไฟล์นี้ ให้หาสาเหตุก่อน`);
}
process.exitCode = failures === 0 ? 0 : 1;
