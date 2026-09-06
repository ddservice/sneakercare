#!/usr/bin/env node
/**
 * เทสต์สูตรกลางของค่าใช้จ่าย (lib/expense-totals.ts)
 *
 * ทำไมต้องมี: ก่อนหน้านี้หน้า /dashboard กับ /expenses เขียนตรรกะกรอง sc_opex กันคนละแบบ
 * แล้วแสดงยอดของเดือนเดียวกันไม่ตรงกันอยู่นาน (ส.ค. 2569 ต่างกัน ฿6,600.51) โดยไม่มีอะไรจับได้
 * เพราะเป็นตัวเลข "ขาด" ไม่ใช่ error — เทสต์นี้ล็อกพฤติกรรมไว้ไม่ให้หลุดซ้ำ
 *
 * ใช้ข้อมูลชุดเดียวกับ sc_opex เดือน 08/2569 ของจริง (ตัวเลขที่กระทบยอดกับ Excel ที่เจ้าของ
 * คำนวณมือแล้วตรงเป๊ะ) เป็นกรณีอ้างอิง
 *
 * รัน: npm run test:expenses
 */

// รัน TypeScript ตรงๆ ไม่ได้ npm script จึงคอมไพล์ lib/expense-totals.ts ด้วย tsc ลง .test-build
// ก่อน แล้วไฟล์นี้ค่อยโหลด JS ที่ได้ (ทดสอบโค้ดตัวจริง ไม่ใช่สำเนาที่ลอกมา)
const { calculateExpenseBreakdown, isOpexRow, isPayrollRow, MAX_REASONABLE_AMOUNT } = await import(
  new URL("../.test-build/expense-totals.js", import.meta.url).href
);

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  failures++;
};
const eq = (label, actual, expected) => {
  if (Math.abs(actual - expected) < 0.005) ok(`${label} = ${actual.toLocaleString()}`);
  else bad(`${label} ได้ ${actual.toLocaleString()} แต่ควรเป็น ${expected.toLocaleString()}`);
};

// ── ข้อมูลจริงย่อส่วนของเดือน 08/2569 ────────────────────────────────────
const rows = [
  // ค่าใช้จ่ายดำเนินงานปกติ
  { id: 1, month: "08/2026", category: "ค่าดำเนินการ", key: "rent", name: "ค่าเช่าร้าน", amount: 18000 },
  { id: 2, month: "08/2026", category: "สาธารณูปโภค & ค่าเช่า", key: "custom_1", name: "ค่าไฟฟ้า", amount: 3958.61 },
  { id: 3, month: "08/2026", category: "ดำเนินงาน & เบ็ดเตล็ด", key: "custom_2", name: "ค่าส่งแกรป", amount: 200 },
  { id: 4, month: "08/2026", category: "ภาษี", key: "sso_employee", name: "ประกันสังคมลูกจ้าง", amount: 1200 },
  // แถวสรุปเบ็ดเตล็ด (ต้องถูกกันออก) + รายการย่อยที่เป็นแหล่งจริง
  { id: 5, month: "08/2026", category: "ค่าดำเนินการ", key: "misc", name: "ค่าใช้จ่ายจิปาถะอื่นๆ", amount: 900 },
  {
    id: 6, month: "08/2026", category: "payslip_detail", key: "misc_items_json", amount: 0,
    name: JSON.stringify([
      { name: "ค่าบรอดแคสไลน์", amount: 400, method: "บัญชีร้าน" },
      { name: "ค่าน้ำมันรถ", amount: 500, method: "เงินสดร้าน" },
    ]),
  },
  // เงินเดือน: แถวยอดสุทธิ (นับ) + ข้อมูลดิบรายคน (ห้ามนับ)
  { id: 7, month: "08/2026", category: "ค่าแรงพนักงาน", key: "emp_ก", name: "เงินจ่ายพนักงาน: ก", amount: 11900 },
  { id: 8, month: "08/2026", category: "payslip_detail", key: "empd_base_sal_ก", name: "empd_base_sal_ก: ก", amount: 12000 },
  // รายรับห้องเช่า — เป็นรายรับ ห้ามนับเป็นรายจ่าย
  { id: 9, month: "08/2026", category: "rental_income", key: "room_income_0", name: "ห้อง 1", amount: 3000 },
  { id: 10, month: "08/2026", category: "rental_meter", key: "room_rent_saved_0", name: "ค่าเช่า", amount: 3000 },
  // ระเบิดเวลา: timestamp ในคอลัมน์เงิน
  { id: 11, month: "08/2026", category: "payslip_detail", key: "audit_log", name: "บันทึกโดย: Milo", amount: 1787827245489 },
];

console.log("\n[1] ยอดรวมต้องแยกส่วนถูกต้อง");
const r = calculateExpenseBreakdown(rows);
// 18000 + 3958.61 + 200 + 1200 + (400 + 500 จาก misc_items_json) = 24,258.61
eq("totalOpex", r.totalOpex, 24258.61);
eq("totalPayroll", r.totalPayroll, 11900);
eq("totalExpenses", r.totalExpenses, 36158.61);
eq("totalRentalIncome", r.totalRentalIncome, 3000);

console.log("\n[2] แถวที่ห้ามนับเป็นค่าใช้จ่าย");
const names = r.opexLines.map((l) => l.name);
for (const [label, forbidden] of [
  ["แถวสรุปเบ็ดเตล็ด key=misc (กันนับซ้ำกับรายการย่อย)", "ค่าใช้จ่ายจิปาถะอื่นๆ"],
  ["ข้อมูลดิบสลิปรายคน empd_*", "empd_base_sal_ก: ก"],
  ["รายรับห้องเช่า", "ห้อง 1"],
  ["เลขมิเตอร์/ค่าเช่าที่บันทึกไว้", "ค่าเช่า"],
  ["แถว audit_log ที่เคยเก็บ timestamp ใน amount", "บันทึกโดย: Milo"],
  ["ยอดสุทธิเงินเดือน (ต้องอยู่ใน payroll ไม่ใช่ opex)", "เงินจ่ายพนักงาน: ก"],
]) {
  if (!names.includes(forbidden)) ok(`ไม่นับ: ${label}`);
  else bad(`ยังนับอยู่: ${label}`);
}

console.log("\n[3] รายการย่อยของเบ็ดเตล็ดถูกแตกออกเป็นบรรทัด");
if (names.includes("ค่าบรอดแคสไลน์") && names.includes("ค่าน้ำมันรถ")) ok("แตกรายการย่อยครบ 2 รายการ");
else bad(`แตกรายการย่อยไม่ครบ: ${JSON.stringify(names)}`);
eq("miscItems รวม", r.miscItems.reduce((s, i) => s + i.amount, 0), 900);

console.log("\n[4] หมวดใหม่ที่ไม่เคยมีมาก่อนต้องถูกนับอัตโนมัติ (ห้ามใช้ whitelist)");
const withNewCategory = calculateExpenseBreakdown([
  { id: 99, month: "08/2026", category: "หมวดที่เพิ่งสร้างวันนี้", key: "custom_99", name: "ของใหม่", amount: 1234 },
]);
eq("หมวดใหม่ถูกนับ", withNewCategory.totalOpex, 1234);

console.log("\n[5] เพดานกันค่าผิดปกติ");
const huge = calculateExpenseBreakdown([
  { id: 100, month: "08/2026", category: "ค่าดำเนินการ", key: "x", name: "ค่าผิดปกติ", amount: MAX_REASONABLE_AMOUNT + 1 },
]);
eq("ค่าที่เกินเพดานถูกกันออก", huge.totalOpex, 0);
const negative = calculateExpenseBreakdown([
  { id: 101, month: "08/2026", category: "ค่าดำเนินการ", key: "y", name: "ติดลบ", amount: -500 },
]);
eq("ค่าติดลบถูกกันออก", negative.totalOpex, 0);

console.log("\n[6] JSON เสียต้องไม่ทำให้ทั้งหน้าพัง แต่ต้องไม่เงียบ");
let reported = null;
const broken = calculateExpenseBreakdown(
  [{ id: 7, month: "08/2026", category: "payslip_detail", key: "misc_items_json", name: "{ไม่ใช่ JSON", amount: 0 }],
  (id) => { reported = id; }
);
if (broken.totalOpex === 0 && reported === 7) ok("ข้ามแถวที่ JSON เสีย และเรียก callback แจ้ง id=7");
else bad(`ไม่ได้แจ้ง parse error (reported=${JSON.stringify(reported)})`);

console.log("\n[7] ตัวช่วยระดับแถว");
if (isOpexRow({ category: "ค่าดำเนินการ", key: "rent" })) ok("isOpexRow: ค่าเช่าร้านนับ");
else bad("isOpexRow: ค่าเช่าร้านควรนับ");
if (!isOpexRow({ category: "payslip_detail", key: "audit_log" })) ok("isOpexRow: payslip_detail ไม่นับ");
else bad("isOpexRow: payslip_detail ไม่ควรนับ");
if (isPayrollRow({ category: "ค่าแรงพนักงาน", key: "emp_ก" })) ok("isPayrollRow: แถวเงินเดือนนับเป็น payroll");
else bad("isPayrollRow: แถวเงินเดือนควรนับ");
if (!isPayrollRow({ category: "ค่าแรงพนักงาน", key: "empd_base_sal_ก" })) ok("isPayrollRow: แถว empd_* ไม่นับ");
else bad("isPayrollRow: แถว empd_* ไม่ควรนับ");

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด" : `\n❌ ไม่ผ่าน ${failures} ข้อ`);
process.exitCode = failures === 0 ? 0 : 1;
