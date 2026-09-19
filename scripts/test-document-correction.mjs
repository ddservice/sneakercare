#!/usr/bin/env node
const {
  canCorrectParent,
  isCorrectionType,
  marksSourceConverted,
  planCorrection,
  correctionAffectsOfficialBooks,
  correctionAffectsStock,
} = await import(new URL("../.test-build/correction.js", import.meta.url).href);

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

console.log("\n[correction] ต้นทางที่ใช้ได้");
check(canCorrectParent("TAX_INVOICE", "DRAFT"), "ใบกำกับใช้เป็นต้นทางได้", "TAX ใช้เป็นต้นทางไม่ได้");
check(canCorrectParent("INVOICE", "CONVERTED"), "ใบแจ้งหนี้ที่แปลงแล้วยังลดหนี้ได้", "INV แปลงแล้วใช้ไม่ได้");
check(!canCorrectParent("TAX_INVOICE", "VOID"), "ต้นทางที่ยกเลิกแล้วใช้ไม่ได้", "ต้นทาง VOID ยังใช้ได้");
check(!canCorrectParent("QUOTATION", "DRAFT"), "ใบเสนอราคาไม่ใช่ต้นทางลดหนี้", "QA ถูกใช้เป็นต้นทาง");

console.log("\n[correction] เพดานยอด");
const full = planCorrection({
  kind: "CREDIT_NOTE",
  parentType: "TAX_INVOICE",
  parentStatus: "DRAFT",
  parentGrandTotal: 1070,
  existingCreditTotal: 0,
  existingDebitTotal: 0,
  requestAmount: 1070,
});
check(full.ok, "ลดหนี้เต็มยอดได้หนึ่งใบ", full.ok ? "" : full.error);

const second = planCorrection({
  kind: "CREDIT_NOTE",
  parentType: "TAX_INVOICE",
  parentStatus: "DRAFT",
  parentGrandTotal: 1070,
  existingCreditTotal: 1070,
  existingDebitTotal: 0,
  requestAmount: 1,
});
check(!second.ok, "ลดหนี้ซ้ำเกินยอดถูกปฏิเสธ", "ลดหนี้ซ้ำยังผ่าน");

const partialThenRest = planCorrection({
  kind: "CREDIT_NOTE",
  parentType: "RECEIPT",
  parentStatus: "PAID",
  parentGrandTotal: 1000,
  existingCreditTotal: 400,
  existingDebitTotal: 0,
  requestAmount: 600,
});
check(partialThenRest.ok, "ลดหนี้หลายใบรวมไม่เกินต้นทาง", partialThenRest.ok ? "" : partialThenRest.error);

const afterDebit = planCorrection({
  kind: "CREDIT_NOTE",
  parentType: "INVOICE",
  parentStatus: "DRAFT",
  parentGrandTotal: 1000,
  existingCreditTotal: 1000,
  existingDebitTotal: 200,
  requestAmount: 200,
});
check(afterDebit.ok, "มีใบเพิ่มหนี้แล้วลดหนี้เพิ่มได้ตามยอดที่เพิ่ม", afterDebit.ok ? "" : afterDebit.error);

const debit = planCorrection({
  kind: "DEBIT_NOTE",
  parentType: "INVOICE",
  parentStatus: "DRAFT",
  parentGrandTotal: 1000,
  existingCreditTotal: 0,
  existingDebitTotal: 0,
  requestAmount: 150,
});
check(debit.ok, "ใบเพิ่มหนี้ยอดบวกได้", debit.ok ? "" : debit.error);

console.log("\n[correction] ขอบเขต");
check(isCorrectionType("CREDIT_NOTE") && isCorrectionType("DEBIT_NOTE"), "จำแนกประเภทใบลด/เพิ่มหนี้", "จำแนกประเภทไม่ได้");
check(!marksSourceConverted("CREDIT_NOTE"), "ออกใบลดหนี้แล้วต้นทางไม่ถูกตั้งเป็นแปลงแล้ว", "ต้นทางถูกแปลง");
check(marksSourceConverted("TAX_INVOICE"), "แปลงเป็นใบกำกับยังตั้งต้นทางเป็นแปลงแล้ว", "แปลง TAX ไม่ตั้ง CONVERTED");
check(correctionAffectsOfficialBooks() === false, "ไม่กลับรายการ sc_sales", "ไปแตะบัญชีร้าน");
check(correctionAffectsStock() === false, "ไม่คืนสต๊อก (ยังไม่มีมติต้นทุนคืน)", "ไปตัด/คืนสต๊อก");

if (failures) {
  console.log(`\n[correction] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[correction] ผ่านทั้งหมด");
}
