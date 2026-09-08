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
const {
  calculateExpenseBreakdown,
  isOpexRow,
  isPayrollRow,
  isPartnerShareEntry,
  PARTNER_SHARE_CATEGORY,
  MAX_REASONABLE_AMOUNT,
} = await import(
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


console.log("\n[8] ส่วนแบ่งกำไรหุ้นส่วนต้องแยกออกมาได้ แต่ยังนับรวมในยอดค่าใช้จ่าย");
// ทำไมต้องล็อกไว้: ยอดนี้คำนวณ *จาก* กำไรสุทธิแล้วบันทึกกลับเข้ามาเป็นค่าใช้จ่าย
// ถ้าไม่แยกออกมา ตัวเลขกำไรบนหน้าจอจะเป็นยอดหลังแบ่งแล้ว เอาไปคูณ 20% ซ้ำไม่ได้
const shareRows = [
  { id: 200, month: "07/2026", category: "ค่าดำเนินการ", key: "rent", name: "ค่าเช่าร้าน", amount: 18000 },
  {
    id: 201, month: "07/2026", category: "payslip_detail", key: "misc_items_json", amount: 0,
    name: JSON.stringify([
      { name: "ค่าที่ปรึกษา", amount: 10000, method: "บัญชีร้าน" },
      { name: "ค่าหุ้นส่วน 20%", amount: 5269, method: "เงินสดร้าน" },
    ]),
  },
  // เงินเดือนหุ้นส่วนผู้จัดการ = เงินเดือน ไม่ใช่ส่วนแบ่งกำไร ต้องไม่ถูกนับเป็นส่วนแบ่ง
  { id: 202, month: "07/2026", category: "ค่าแรง & เงินเดือน", key: "custom_9", name: "เงินเดือนหุ้นส่วนผู้จัดการ (ไม่หัก ปกส.)", amount: 10000 },
];
const sh = calculateExpenseBreakdown(shareRows);
eq("ส่วนแบ่งหุ้นส่วนแยกออกมาได้", sh.totalPartnerShare, 5269);
eq("ยอดค่าใช้จ่ายรวมยังนับส่วนแบ่งอยู่", sh.totalExpenses, 18000 + 10000 + 5269 + 10000);
eq("ยอดก่อนหักส่วนแบ่ง", sh.totalExpensesBeforePartnerShare, 18000 + 10000 + 10000);
const shareLine = sh.opexLines.find((l) => l.isPartnerShare);
if (shareLine && shareLine.category === PARTNER_SHARE_CATEGORY) ok("รายการส่วนแบ่งถูกย้ายไปหมวดของตัวเอง");
else bad("รายการส่วนแบ่งควรอยู่หมวด " + PARTNER_SHARE_CATEGORY);
if (isPartnerShareEntry("ค่าหุ้นส่วน 20%")) ok("isPartnerShareEntry: 'ค่าหุ้นส่วน 20%' ใช่");
else bad("isPartnerShareEntry: 'ค่าหุ้นส่วน 20%' ควรใช่");
if (!isPartnerShareEntry("เงินเดือนหุ้นส่วนผู้จัดการ (ไม่หัก ปกส.)")) ok("isPartnerShareEntry: เงินเดือนหุ้นส่วนผู้จัดการ ไม่ใช่");
else bad("เงินเดือนหุ้นส่วนผู้จัดการ ต้องไม่ถูกนับเป็นส่วนแบ่งกำไร");
if (!isPartnerShareEntry("คืนเงินหุ้นส่วน")) ok("isPartnerShareEntry: คืนเงินหุ้นส่วน (คืนทุน) ไม่ใช่");
else bad("คืนเงินหุ้นส่วน ต้องไม่ถูกนับเป็นส่วนแบ่งกำไร");
if (isPartnerShareEntry("อะไรก็ตาม", PARTNER_SHARE_CATEGORY)) ok("isPartnerShareEntry: ยึด category ใหม่เป็นหลักได้");
else bad("แถวที่ category เป็น " + PARTNER_SHARE_CATEGORY + " ควรถูกนับเป็นส่วนแบ่ง");


console.log("\n[9] สูตรรวมเงินซื้อของเข้าคลัง (lib/stock-purchases.ts)");
const { sumStockPurchases, monthBounds, SUPPLY_CATEGORIES } = await import(
  new URL("../.test-build/stock-purchases.js", import.meta.url).href
);
eq("นับเฉพาะ stock_in", sumStockPurchases([
  { id: "a", txn_type: "stock_in", total_cost: 100 },
  { id: "b", txn_type: "stock_out", total_cost: 999 },
  { id: "c", txn_type: "adjustment_decrease", total_cost: 999 },
]), 100);
eq("ข้ามแถวที่ถูกแก้ไขทับแล้ว", sumStockPurchases([
  { id: "a", txn_type: "stock_in", total_cost: 796 },
  { id: "b", txn_type: "adjustment_decrease", corrects_txn_id: "a", total_cost: 754.1 },
  { id: "c", txn_type: "stock_in", corrects_txn_id: "a", total_cost: 531 },
]), 531);
eq("ข้ามแถวที่ถูก reject", sumStockPurchases([
  { id: "a", txn_type: "stock_in", total_cost: 100 },
  { id: "b", txn_type: "stock_in", status: "rejected", total_cost: 999 },
]), 100);
eq("ต้นทุนติดลบนับเป็นค่าสัมบูรณ์", sumStockPurchases([{ id: "a", txn_type: "stock_in", total_cost: -250 }]), 250);
eq("ไม่มีแถวเลย = 0", sumStockPurchases([]), 0);
const mb = monthBounds("12/2026");
if (mb && mb.gte === "2026-12-01" && mb.lt === "2027-01-01") ok("monthBounds ข้ามปีถูกต้อง");
else bad(`monthBounds("12/2026") ได้ ${JSON.stringify(mb)}`);
if (monthBounds("ไม่ใช่เดือน") === null) ok("monthBounds คืน null เมื่อรูปแบบผิด");
else bad("monthBounds ควรคืน null เมื่อรูปแบบผิด");
if (SUPPLY_CATEGORIES.has("น้ำยา & วัสดุสิ้นเปลือง")) ok("SUPPLY_CATEGORIES มีหมวดน้ำยา");
else bad("SUPPLY_CATEGORIES ต้องมีหมวดน้ำยา");

console.log(failures === 0 ? "\n✅ ผ่านทั้งหมด" : `\n❌ ไม่ผ่าน ${failures} ข้อ`);
process.exitCode = failures === 0 ? 0 : 1;
