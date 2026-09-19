/**
 * ล็อกนโยบายเงินกลาง (สตางค์ + HALF_UP) — ไม่ใช้ JavaScript number คำนวณ
 */

const {
  parseMoney,
  formatMoney,
  moneyString,
  addMoney,
  subMoney,
  percentOf,
  vatOnExclusive,
  settleExclusiveVat,
  settleInclusiveVat,
  moneyNumber,
} = await import(new URL("../.test-build/money.js", import.meta.url).href);

let failures = 0;
const ok = (m) => console.log(`  ✓ ${m}`);
const bad = (m) => {
  console.log(`  ✗ ${m}`);
  failures++;
};
const same = (label, actual, expected) => {
  if (actual === expected) ok(label);
  else bad(`${label}: ได้ ${actual} แต่ควรเป็น ${expected}`);
};

console.log("\n[money] parse / format");
same("1000", formatMoney(parseMoney("1000")), "1000.00");
same("1000.5", formatMoney(parseMoney("1000.5")), "1000.50");
same("1,800.00", formatMoney(parseMoney("1,800.00")), "1800.00");
same("ปัด 1.005 → 1.01", formatMoney(parseMoney("1.005")), "1.01");
same("ปัด 1.004 → 1.00", formatMoney(parseMoney("1.004")), "1.00");

console.log("\n[money] บวก ลบ");
same("18 + 0.90", addMoney("18.00", "0.90"), "18.90");
same("18.00 − 0.90", subMoney("18.00", "0.90"), "17.10");

console.log("\n[money] VAT 7% นอกราคา (นโยบายปัจจุบันของเอกสารขาย)");
same("1000 × 7%", vatOnExclusive("1000.00", "7"), "70.00");
same("18000 × 7%", vatOnExclusive("18000", "7"), "1260.00");
const ex = settleExclusiveVat("1000.00", "7");
same("exclusive subtotal", ex.subtotal, "1000.00");
same("exclusive vat", ex.vatAmount, "70.00");
same("exclusive grand", ex.grandTotal, "1070.00");
same("0%", settleExclusiveVat("1000.00", "0").vatAmount, "0.00");

console.log("\n[money] ราคารวม VAT 7% (ยังไม่ใช้บนเอกสารขาย — ล็อกสูตรไว้ก่อน)");
const inc = settleInclusiveVat("1070.00", "7");
same("inclusive grand", inc.grandTotal, "1070.00");
same("inclusive base", inc.subtotal, "1000.00");
same("inclusive vat", inc.vatAmount, "70.00");

console.log("\n[money] WHT 5% จากฐานก่อน VAT (ค่าเช่า 18000)");
same("18000 × 5%", percentOf("18000.00", "5"), "900.00");

console.log("\n[money] ห่อ number เส้นทางเก่า — จำนวนเต็มสตางค์ต้องเท่าเดิม");
same("moneyNumber(1000.5)", moneyNumber(1000.5), 1000.5);
same("moneyString จาก number 1000", moneyString(1000), "1000.00");

console.log("\n[money] ปฏิเสธอินพุตที่ไม่ใช่จำนวน");
let threw = false;
try {
  parseMoney("12.3.4");
} catch {
  threw = true;
}
same("อินพุตผิดรูปโยน error", threw, true);

if (failures) {
  console.log(`\nล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\nผ่านทั้งหมด");
}
