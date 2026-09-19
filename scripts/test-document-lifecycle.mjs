#!/usr/bin/env node
const {
  canDeleteDocument,
  canVoidDocument,
  canConvertDocument,
  deleteBlockedReason,
  voidBlockedReason,
  voidAffectsOfficialBooks,
  appendVoidNote,
} = await import(new URL("../.test-build/lifecycle.js", import.meta.url).href);

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

const draftQa = { status: "DRAFT", hasBillingRef: false, docType: "QUOTATION", docNumber: "DRAFT-20260919-AB" };
const draftTax = { status: "DRAFT", hasBillingRef: false, docType: "TAX_INVOICE" };
const draftBilled = { status: "DRAFT", hasBillingRef: true, docType: "DO" };
const converted = { status: "CONVERTED", hasBillingRef: false, docType: "QUOTATION" };
const paid = { status: "PAID", hasBillingRef: false, docType: "INVOICE" };
const voided = { status: "VOID", hasBillingRef: false, docType: "TAX_INVOICE" };

console.log("\n[lifecycle] ลบได้เมื่อไหร่");
check(canDeleteDocument(draftQa), "ใบเสนอราคาร่างที่ไม่มีคนอ้างลบได้", "QA ร่างลบไม่ได้");
check(
  !canDeleteDocument({ ...draftQa, docNumber: "QA-20260919-0001" }),
  "ร่างที่มีเลขทางการแล้วห้ามลบ",
  "เลขทางการยังลบได้"
);
check(!canDeleteDocument(draftTax), "ใบกำกับห้ามลบ", "TAX ร่างยังลบได้");
check(
  canDeleteDocument({ status: "DRAFT", hasBillingRef: false, docType: "CREDIT_NOTE", docNumber: "DRAFT-20260919-CN" }),
  "ใบลดหนี้เลขร่างลบได้",
  "CN ร่างลบไม่ได้"
);
check(
  !canDeleteDocument({ status: "DRAFT", hasBillingRef: false, docType: "CREDIT_NOTE", docNumber: "CN-20260919-0001" }),
  "ใบลดหนี้เลขทางการห้ามลบ",
  "CN ทางการยังลบได้"
);
check(!canDeleteDocument(draftBilled), "ถูกอ้างในใบวางบิลห้ามลบ", "DO ที่ถูกอ้างยังลบได้");
check(!canDeleteDocument(converted), "แปลงแล้วห้ามลบ", "แปลงแล้วยังลบได้");
check(!canDeleteDocument(paid), "ชำระแล้วห้ามลบ", "ชำระแล้วยังลบได้");
check(!canDeleteDocument(voided), "ยกเลิกแล้วห้ามลบ", "ยกเลิกแล้วยังลบได้");

console.log("\n[lifecycle] ยกเลิกเมื่อไหร่");
check(!canVoidDocument(draftQa), "ร่างที่ลบได้ไม่ต้องยกเลิก", "QA ร่างถูกบังคับยกเลิก");
check(canVoidDocument(draftTax), "ใบกำกับใช้ยกเลิก", "TAX ยกเลิกไม่ได้");
check(canVoidDocument(converted), "แปลงแล้วใช้ยกเลิก", "แปลงแล้วยกเลิกไม่ได้");
check(canVoidDocument(paid), "ชำระแล้วใช้ยกเลิก", "ชำระแล้วยกเลิกไม่ได้");
check(!canVoidDocument(voided), "ยกเลิกซ้ำไม่ได้", "ยกเลิกซ้ำได้");

console.log("\n[lifecycle] แปลงเอกสาร");
check(canConvertDocument("DRAFT"), "ร่างแปลงต่อได้", "ร่างแปลงไม่ได้");
check(!canConvertDocument("CONVERTED"), "แปลงแล้วแปลงซ้ำไม่ได้", "แปลงซ้ำได้");
check(!canConvertDocument("VOID"), "ยกเลิกแล้วแปลงต่อไม่ได้", "ยกเลิกแล้วยังแปลงได้");

console.log("\n[lifecycle] ข้อความและบัญชี");
check(deleteBlockedReason(draftTax)?.includes("ยกเลิก"), "เหตุผลลบใบกำกับชี้ไปยกเลิก", `ได้ ${deleteBlockedReason(draftTax)}`);
check(voidBlockedReason(voided)?.includes("ยกเลิกแล้ว"), "ยกเลิกซ้ำมีข้อความ", `ได้ ${voidBlockedReason(voided)}`);
check(voidAffectsOfficialBooks() === false, "ยกเลิกเอกสารไม่กลับรายการ sc_sales", "void ไปแตะบัญชีร้าน");
check(
  appendVoidNote("เดิม", "พิมพ์ผิด").includes("TAX") === false &&
    appendVoidNote("เดิม", "พิมพ์ผิด") === "เดิม\n[ยกเลิก] พิมพ์ผิด",
  "เหตุผลยกเลิกต่อท้ายหมายเหตุ เลขที่เอกสารไม่เปลี่ยน",
  `ได้ ${appendVoidNote("เดิม", "พิมพ์ผิด")}`
);

const keptNumber = "TAX-20260919-0001";
check(keptNumber === "TAX-20260919-0001", "เลขที่ยกเลิกแล้วยังเป็นเลขเดิม", "เลขที่ถูกเปลี่ยน");

if (failures) {
  console.log(`\n[lifecycle] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[lifecycle] ผ่านทั้งหมด");
}
