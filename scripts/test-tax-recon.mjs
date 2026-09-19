#!/usr/bin/env node
const { planTaxRecon, countsTowardOutputVat } = await import(
  new URL("../.test-build/tax-recon.js", import.meta.url).href
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

const docs = [
  { docType: "TAX_INVOICE", status: "DRAFT", docNumber: "TAX-20260919-0001", issueDate: "2026-09-10", grandTotal: 1070, vatAmount: 70 },
  { docType: "INVOICE", status: "VOID", docNumber: "INV-20260919-0002", issueDate: "2026-09-11", grandTotal: 500, vatAmount: 0 },
  { docType: "INVOICE", status: "DRAFT", docNumber: "DRAFT-20260919-AA", issueDate: "2026-09-12", grandTotal: 300, vatAmount: 0 },
  { docType: "CREDIT_NOTE", status: "DRAFT", docNumber: "CN-20260919-0001", issueDate: "2026-09-15", grandTotal: 70, vatAmount: 0 },
  { docType: "TAX_INVOICE", status: "DRAFT", docNumber: "TAX-20260801-0001", issueDate: "2026-08-01", grandTotal: 9999, vatAmount: 600 },
];

console.log("\n[tax-recon] นับเอกสาร");
check(countsTowardOutputVat(docs[0]), "ใบกำกับที่ออกแล้วเข้ารายงาน", "TAX ไม่เข้า");
check(!countsTowardOutputVat(docs[1]), "ใบที่ยกเลิกไม่นับ", "VOID ยังนับ");
check(!countsTowardOutputVat(docs[2]), "เลขร่างไม่นับ", "DRAFT- ยังนับ");

console.log("\n[tax-recon] กระดาษทำงาน");
const paper = planTaxRecon({
  periodYm: "2026-09",
  booksRevenue: 1200,
  booksCashIn: 1100,
  documents: docs,
  expenseVatIn: 0,
  whtPayable: 900,
});
check(paper.documentSales === 1070, "ขายเอกสาร = 1070", `ได้ ${paper.documentSales}`);
check(paper.creditNotes === 70, "ลดหนี้ = 70", `ได้ ${paper.creditNotes}`);
check(paper.documentNetSales === 1000, "สุทธิเอกสาร = 1000", `ได้ ${paper.documentNetSales}`);
check(paper.salesGap === 200, "ส่วนต่างบัญชี vs เอกสาร = 200", `ได้ ${paper.salesGap}`);
check(paper.vatOut === 70, "ภาษีขาย = 70", `ได้ ${paper.vatOut}`);
check(paper.whtPayable === 900, "WHT ที่ต้องนำส่ง = 900", `ได้ ${paper.whtPayable}`);
check(paper.readyToFile === false, "ยังไม่พร้อมยื่น", "สูตรบอกว่าพร้อมยื่น");
check(paper.blockers.some((b) => b.includes("ไม่ตรงกัน")), "มีตัวบล็อกส่วนต่างยอดขาย", "ไม่มีตัวบล็อกส่วนต่าง");
check(paper.blockers.some((b) => b.includes("สมุดซื้อ")), "มีตัวบล็อกสมุดภาษีซื้อไม่ครบ", "ไม่มีตัวบล็อกสมุดซื้อ");
check(paper.blockers.some((b) => b.includes("ปิดงวด")), "มีตัวบล็อกปิดงวด", "ไม่มีตัวบล็อกปิดงวด");

const matched = planTaxRecon({
  periodYm: "2026-09",
  booksRevenue: 1000,
  booksCashIn: 1000,
  documents: docs,
  expenseVatIn: 20,
  whtPayable: 0,
});
check(matched.salesGap === 0, "ยอดตรงกันแล้วส่วนต่างเป็น 0", `ได้ ${matched.salesGap}`);
check(matched.readyToFile === false, "ยอดตรงกันแล้วยังไม่พร้อมยื่น", "ยอดตรงแล้วถูกตั้งว่าพร้อมยื่น");

const closed = planTaxRecon({
  periodYm: "2026-09",
  booksRevenue: 1000,
  booksCashIn: 1000,
  documents: docs,
  expenseVatIn: 20,
  whtPayable: 0,
  periodClosed: true,
  inputVatComplete: true,
});
check(!closed.blockers.some((b) => b.includes("ปิดงวด")), "ปิดงวดแล้วไม่บล็อกข้อนี้", "ยังบล็อกปิดงวด");
check(closed.readyToFile === false, "ปิดงวดแล้วยังไม่พร้อมยื่น", "ปิดงวดแล้วถูกตั้งว่าพร้อมยื่น");

if (failures) {
  console.log(`\n[tax-recon] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[tax-recon] ผ่านทั้งหมด");
}
