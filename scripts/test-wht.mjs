/**
 * ล็อกสูตรหัก ณ ที่จ่าย + ค่าเช่าตึก — ห้ามให้ WHT กลายเป็นรายจ่ายซ้ำ
 *
 * ตัวอย่างที่เจ้าของใช้จริง: ค่าเช่าตึก ฿18,000 หัก ณ ที่จ่าย 5%
 *   ฐาน          18,000.00
 *   VAT          0.00
 *   ลงบัญชี      18,000.00   ← ค่าใช้จ่ายเต็ม (กระทบยอด Excel ไว้แล้ว)
 *   WHT 5%         900.00   ← นำส่งสรรพากร ไม่ใช่รายจ่ายเพิ่ม
 *   โอนเจ้าของตึก 17,100.00
 */

const {
  settleWht,
  defaultWhtRateForCategory,
  pndFormForPayee,
  classifyPayeeKindFromTaxId,
  incomeTypeForCategory,
  certificateNumber,
  formatTawi50IncomeLine,
  formatTawi50Amount,
  thaiOfficialDate,
  DEFAULT_TAWI50_CONDITION,
  BUILDING_RENT_CATEGORY,
  BUILDING_RENT_WHT_RATE,
} = await import(new URL("../.test-build/wht.js", import.meta.url).href);

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  failures++;
};
const eq = (label, actual, expected) => {
  if (Math.abs(Number(actual) - Number(expected)) < 0.005) ok(`${label} = ${actual}`);
  else bad(`${label} ได้ ${actual} แต่ควรเป็น ${expected}`);
};
const same = (label, actual, expected) => {
  if (actual === expected) ok(label);
  else bad(`${label}: ได้ ${actual} แต่ควรเป็น ${expected}`);
};

console.log("\n[wht] ค่าเช่าตึก ฿18,000 หัก ณ ที่จ่าย 5% (ไม่มี VAT)");
const rent = settleWht({
  baseAmount: 18000,
  vatRate: 0,
  category: BUILDING_RENT_CATEGORY,
});
eq("ฐาน", rent.baseAmount, 18000);
eq("VAT", rent.vatAmount, 0);
eq("ลงบัญชี (ค่าใช้จ่ายเต็ม)", rent.grossAmount, 18000);
eq("WHT 5%", rent.whtAmount, 900);
eq("ยอดโอนเจ้าของตึก", rent.netPayment, 17100);
eq("อัตราเริ่มต้นหมวดค่าเช่า", defaultWhtRateForCategory(BUILDING_RENT_CATEGORY), BUILDING_RENT_WHT_RATE);

console.log("\n[wht] ค่าเช่าจด VAT 7% + หัก 5% จากฐานก่อน VAT");
const rentVat = settleWht({ baseAmount: 18000, vatRate: 7, whtRate: 5 });
eq("VAT 7%", rentVat.vatAmount, 1260);
eq("ลงบัญชี ฐาน+VAT", rentVat.grossAmount, 19260);
eq("WHT ยังคิดจากฐาน 18,000", rentVat.whtAmount, 900);
eq("ยอดโอน = 18,000+1,260-900", rentVat.netPayment, 18360);

console.log("\n[wht] อัตราอื่น + ไม่หัก");
eq("บริการ 3%", settleWht({ baseAmount: 10000, whtRate: 3 }).whtAmount, 300);
eq("โอนสุทธิ 3%", settleWht({ baseAmount: 10000, whtRate: 3 }).netPayment, 9700);
eq("ไม่หัก", settleWht({ baseAmount: 500, whtRate: 0 }).whtAmount, 0);
eq("หมวดอื่นไม่บังคับ 5%", defaultWhtRateForCategory("facility_utilities"), 0);

console.log("\n[wht] รายได้ค่าเช่าห้องที่ถูกหักไว้ (WHT receivable)");
const inbound = settleWht({ baseAmount: 6000, whtRate: 5 });
eq("รายได้ที่ลงบัญชียังเป็นยอดเต็ม", inbound.grossAmount, 6000);
eq("ถูกหักไว้", inbound.whtAmount, 300);
eq("เงินเข้าจริง", inbound.netPayment, 5700);

console.log("\n[wht] ภ.ง.ด. ตามประเภทผู้รับเงิน");
same("บุคคลธรรมดา → ภ.ง.ด.3", pndFormForPayee("person"), "PND3");
same("นิติบุคคล → ภ.ง.ด.53", pndFormForPayee("juristic"), "PND53");
same("เลขนิติบุคคลขึ้นต้น 0", classifyPayeeKindFromTaxId("0105551234567"), "juristic");
same("เลขบัตรประชาชน", classifyPayeeKindFromTaxId("1234567890123"), "person");
same("ประเภทเงินได้ค่าเช่า", incomeTypeForCategory(BUILDING_RENT_CATEGORY).code, "5");
same(
  "ป้ายค่าเช่ามีมาตรา 40(5)",
  incomeTypeForCategory(BUILDING_RENT_CATEGORY).label.includes("มาตรา 40(5)"),
  true
);
same(
  "บรรทัด 50 ทวิ ค่าเช่าอาคาร",
  formatTawi50IncomeLine("5", "ค่าเช่า", 5),
  "ค่าเช่าอาคาร/อสังหาริมทรัพย์ (มาตรา 40(5)) อัตราภาษี 5%"
);
same("ตัวเลขบน 50 ทวิ ไม่ใช้ $", formatTawi50Amount(900), "900.00");
same("ตัวเลขมีคอมม่าหลักพัน", formatTawi50Amount(18000), "18,000.00");
same("วันที่บน 50 ทวิ เป็น พ.ศ.", thaiOfficialDate("2026-09-18"), "18 กันยายน 2569");
same("เงื่อนไขเริ่มต้นคือหัก ณ ที่จ่าย", DEFAULT_TAWI50_CONDITION, "1");
same("เลขที่หนังสือรับรอง", certificateNumber("2026-09", 1), "WHT-202609-0001");

if (failures) {
  console.error(`\n[wht] ไม่ผ่าน ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[wht] ผ่านทั้งหมด");
}
