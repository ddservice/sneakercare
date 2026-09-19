#!/usr/bin/env node
const { countsAsInputVat, planInputVat } = await import(
  new URL("../.test-build/input-vat.js", import.meta.url).href
);

let failures = 0;
const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
  console.log(`  ✗ ${msg}`);
  failures++;
};
function check(cond, yes, no) {
  if (cond) ok(yes);
  else bad(no);
}

const payable = { date: "2026-09-10", vatAmount: 70, direction: "payable", source: "wht_certificate" };
const receivable = { date: "2026-09-10", vatAmount: 70, direction: "receivable", source: "wht_certificate" };
const zero = { date: "2026-09-10", vatAmount: 0, direction: "payable", source: "wht_certificate" };
const otherMonth = { date: "2026-08-10", vatAmount: 21, direction: "payable", source: "wht_certificate" };

console.log("\n[input-vat] นับบรรทัด");
check(countsAsInputVat(payable), "ใบหัก ณ ที่จ่ายฝั่งร้านที่มี VAT นับเป็นภาษีซื้อ", "payable ไม่ถูกนับ");
check(!countsAsInputVat(receivable), "รายได้ที่ถูกหักไว้ไม่ใช่ภาษีซื้อ", "receivable ถูกนับ");
check(!countsAsInputVat(zero), "VAT 0 ไม่นับ", "VAT 0 ยังนับ");
check(
  !countsAsInputVat({ date: "2026-09-10", vatAmount: 70, source: "staged_ocr" }),
  "OCR จำลองไม่นับเป็นภาษีซื้อ",
  "OCR ถูกนับ"
);

console.log("\n[input-vat] รวมงวด");
const book = planInputVat([payable, receivable, zero, otherMonth], "2026-09");
check(book.vatIn === 70, "รวมภาษีซื้องวด = 70", `ได้ ${book.vatIn}`);
check(book.lineCount === 1, "นับ 1 บรรทัด", `ได้ ${book.lineCount}`);
check(book.completeBook === false, "ยังไม่ใช่สมุดซื้อเต็ม", "สูตรบอกว่าสมุดซื้อครบ");

if (failures) {
  console.log(`\n[input-vat] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[input-vat] ผ่านทั้งหมด");
}
