#!/usr/bin/env node
const {
  countsTowardPp30TaxInvoice,
  planPp30Paper,
} = await import(new URL("../.test-build/pp30-paper.js", import.meta.url).href);

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

const docs = [
  { docType: "TAX_INVOICE", status: "DRAFT", docNumber: "TAX-20260919-0001", issueDate: "2026-09-10", subtotal: 1000, vatAmount: 70, grandTotal: 1070 },
  { docType: "INVOICE", status: "CONVERTED", docNumber: "INV-20260919-0001", issueDate: "2026-09-10", subtotal: 1000, vatAmount: 70, grandTotal: 1070 },
  { docType: "CREDIT_NOTE", status: "DRAFT", docNumber: "CN-20260919-0001", issueDate: "2026-09-15", subtotal: 100, vatAmount: 7, grandTotal: 107 },
  { docType: "DEBIT_NOTE", status: "DRAFT", docNumber: "DN-20260919-0001", issueDate: "2026-09-16", subtotal: 50, vatAmount: 3.5, grandTotal: 53.5 },
  { docType: "TAX_INVOICE", status: "VOID", docNumber: "TAX-20260919-0009", issueDate: "2026-09-12", subtotal: 500, vatAmount: 35, grandTotal: 535 },
  { docType: "TAX_INVOICE", status: "DRAFT", docNumber: "DRAFT-20260919-AA", issueDate: "2026-09-12", subtotal: 200, vatAmount: 14, grandTotal: 214 },
  { docType: "INVOICE", status: "DRAFT", docNumber: "INV-20260919-0002", issueDate: "2026-09-11", subtotal: 400, vatAmount: 28, grandTotal: 428 },
];

console.log("\n[pp30] นับสมุดขาย");
check(countsTowardPp30TaxInvoice(docs[0]), "ใบกำกับที่ออกแล้วเข้าสมุดขาย", "TAX ไม่เข้า");
check(!countsTowardPp30TaxInvoice(docs[1]), "ใบแจ้งหนี้ที่แปลงแล้วไม่เข้าสมุดขาย", "CONVERTED ยังเข้า");
check(!countsTowardPp30TaxInvoice(docs[4]), "ใบที่ยกเลิกไม่เข้า", "VOID ยังเข้า");
check(!countsTowardPp30TaxInvoice(docs[5]), "เลขร่างไม่เข้า", "DRAFT- ยังเข้า");
check(!countsTowardPp30TaxInvoice(docs[6]), "ใบแจ้งหนี้ไม่ใช่สมุดภาษีขาย", "INV ถูกนับใน ภ.พ.30");

console.log("\n[pp30] ช่องแบบ ภ.พ.30");
const paper = planPp30Paper({
  periodYm: "2026-09",
  documents: docs,
  purchaseBase: 300,
  purchaseVat: 21,
});
check(paper.line1Sales === 950, "ช่อง 1 ยอดขาย = 1000-100+50", `ได้ ${paper.line1Sales}`);
check(paper.line2ZeroRated === 0, "ช่อง 2 อัตรา 0% ยังไม่แยก = 0", `ได้ ${paper.line2ZeroRated}`);
check(paper.line3Exempt === 0, "ช่อง 3 ยกเว้นยังไม่แยก = 0", `ได้ ${paper.line3Exempt}`);
check(paper.line4TaxableSales === 950, "ช่อง 4 = 1-2-3", `ได้ ${paper.line4TaxableSales}`);
check(paper.line5OutputVat === 66.5, "ช่อง 5 ภาษีขาย = 70-7+3.50", `ได้ ${paper.line5OutputVat}`);
check(paper.line6PurchaseBase === 300, "ช่อง 6 ยอดซื้อ", `ได้ ${paper.line6PurchaseBase}`);
check(paper.line7InputVat === 21, "ช่อง 7 ภาษีซื้อ", `ได้ ${paper.line7InputVat}`);
check(paper.line8VatPayable === 45.5, "ช่อง 8 ต้องชำระ = 66.50-21", `ได้ ${paper.line8VatPayable}`);
check(paper.line9VatExcess === 0, "ช่อง 9 ชำระเกิน = 0", `ได้ ${paper.line9VatExcess}`);
check(paper.line10ExcessBroughtForward === 0, "ช่อง 10 ยกมา = 0", `ได้ ${paper.line10ExcessBroughtForward}`);
check(paper.line11NetPayable === 45.5, "ช่อง 11 สุทธิต้องชำระ", `ได้ ${paper.line11NetPayable}`);
check(paper.line12NetExcess === 0, "ช่อง 12 สุทธิเกิน = 0", `ได้ ${paper.line12NetExcess}`);
check(paper.readyToFile === false, "ยังไม่พร้อมยื่น", "สูตรบอกว่าพร้อมยื่น");

const excess = planPp30Paper({
  periodYm: "2026-09",
  documents: [docs[0]],
  purchaseBase: 2000,
  purchaseVat: 140,
  periodClosed: true,
  inputVatComplete: true,
});
check(excess.line8VatPayable === 0, "ภาษีซื้อมากกว่า = ช่อง 8 เป็น 0", `ได้ ${excess.line8VatPayable}`);
check(excess.line9VatExcess === 70, "ช่อง 9 ชำระเกิน = 140-70", `ได้ ${excess.line9VatExcess}`);
check(excess.line11NetPayable === 0, "เกินแล้วช่อง 11 เป็น 0", `ได้ ${excess.line11NetPayable}`);
check(excess.line12NetExcess === 70, "ช่อง 12 = ช่อง 9 เมื่อไม่มียกมา", `ได้ ${excess.line12NetExcess}`);
check(excess.readyToFile === false, "ปิดงวดและยอดครบแล้วยังไม่พร้อมยื่น", "ถูกตั้งว่าพร้อมยื่น");

if (failures) {
  console.log(`\n[pp30] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[pp30] ผ่านทั้งหมด");
}
