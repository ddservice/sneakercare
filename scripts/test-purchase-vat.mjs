#!/usr/bin/env node
const {
  countsAsPurchaseVat,
  parsePurchaseVatLines,
  planAddPurchaseVat,
  planPurchaseVat,
  planRemovePurchaseVat,
} = await import(new URL("../.test-build/purchase-vat.js", import.meta.url).href);
const { mergeInputVat, countsAsInputVat } = await import(
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

const manual = {
  id: "1",
  date: "2026-09-10",
  vatAmount: 70,
  baseAmount: 1000,
  vendorName: "บจก. น้ำยา",
  vendorTaxId: "0105558000000",
  invoiceNumber: "INV-1",
  source: "manual_invoice",
};
const ocr = { ...manual, id: "2", source: "staged_ocr", vatAmount: 99 };
const guessed = { ...manual, id: "3", source: "expense_guess", vatAmount: 21 };
const zero = { ...manual, id: "4", vatAmount: 0 };
const other = { ...manual, id: "5", date: "2026-08-10", vatAmount: 14 };

console.log("\n[purchase-vat] นับบรรทัด");
check(countsAsPurchaseVat(manual), "ใบกำกับที่กรอกเองที่มี VAT นับ", "ใบกรอกเองไม่ถูกนับ");
check(!countsAsPurchaseVat(ocr), "OCR จำลองไม่นับ", "OCR ถูกนับ");
check(!countsAsPurchaseVat(guessed), "เดา VAT จากรายจ่ายไม่นับ", "รายจ่ายเดาถูกนับ");
check(!countsAsPurchaseVat(zero), "VAT 0 ไม่นับ", "VAT 0 ยังนับ");
check(!countsAsInputVat({ date: "2026-09-10", vatAmount: 70, source: "staged_ocr" }), "OCR ไม่ผ่านสูตรภาษีซื้อรวม", "OCR หลุดเข้ารวม");

console.log("\n[purchase-vat] รวมงวด");
const book = planPurchaseVat([manual, ocr, guessed, zero, other], "2026-09");
check(book.vatIn === 70, "ภาษีซื้องวดจากสมุดซื้อ = 70", `ได้ ${book.vatIn}`);
check(book.lineCount === 1, "นับ 1 บรรทัด", `ได้ ${book.lineCount}`);
check(book.completeBook === false, "ยังไม่ใช่สมุดซื้อเต็ม", "สูตรบอกว่าสมุดซื้อครบ");

const merged = mergeInputVat(
  [{ date: "2026-09-10", vatAmount: 21, direction: "payable", source: "wht_certificate" }],
  [manual, ocr],
  "2026-09"
);
check(merged.vatIn === 91, "รวม WHT 21 + ใบเสร็จ 70", `ได้ ${merged.vatIn}`);
check(merged.completeBook === false, "รวมแล้วยังไม่ใช่สมุดซื้อเต็ม", "รวมแล้วถูกตั้งว่าครบ");

console.log("\n[purchase-vat] แผนเพิ่ม/ลบ");
check(parsePurchaseVatLines(null).length === 0, "ยังไม่เคยกรอก = ว่าง", "ค่าว่างถูกนับเป็นบรรทัด");
const added = planAddPurchaseVat([], {
  date: "2026-09-12",
  vatAmount: 7,
  vendorName: "ร้านก",
  id: "pv-1",
});
check(added.ok && added.next.length === 1, "เพิ่มใบกรอกเองได้", "เพิ่มไม่ได้");
const replayVat = planAddPurchaseVat(added.next, {
  date: "2026-09-12",
  vatAmount: 7,
  vendorName: "ร้านก",
  id: "pv-1",
});
check(replayVat.ok && replayVat.next.length === 1, "id เดิมไม่เพิ่มบรรทัดสมุดซื้อ", `ได้ ${replayVat.next?.length}`);
check(!planAddPurchaseVat([], { date: "2026-09-12", vatAmount: 7, vendorName: "" }).ok, "ไม่มีชื่อผู้ขายเพิ่มไม่ได้", "ชื่อว่างถูกเพิ่ม");
check(!planAddPurchaseVat([], { date: "bad", vatAmount: 7, vendorName: "ก" }).ok, "วันที่ผิดรูปเพิ่มไม่ได้", "วันที่ผิดถูกเพิ่ม");
const removed = planRemovePurchaseVat(added.next, "pv-1");
check(removed.ok && removed.next.length === 0, "ลบบรรทัดได้", "ลบไม่ได้");

if (failures) {
  console.log(`\n[purchase-vat] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[purchase-vat] ผ่านทั้งหมด");
}
