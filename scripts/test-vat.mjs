/**
 * ล็อกกฎ VAT บนเอกสารขาย — จด/ไม่จดเป็นระดับสาขา, เงินสด vs VAT เลือกต่อใบ
 */

const {
  parseVatRegistered,
  parseBranchVatFlag,
  canIssueTaxInvoice,
  vatChoiceAllowed,
  defaultChargeVat,
  documentVatRate,
  settleDocumentVat,
  STANDARD_VAT_RATE,
} = await import(new URL("../.test-build/vat.js", import.meta.url).href);

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
const eq = (label, actual, expected) => {
  if (Math.abs(Number(actual) - Number(expected)) < 0.005) ok(`${label} = ${actual}`);
  else bad(`${label} ได้ ${actual} แต่ควรเป็น ${expected}`);
};

console.log("\n[vat] ค่าใน sc_settings");
same("ไม่มีคีย์ = จด VAT (กิจการแรก)", parseVatRegistered(undefined), true);
same("ค่าว่าง = จด VAT", parseVatRegistered(""), true);
same("true", parseVatRegistered("true"), true);
same("false", parseVatRegistered("false"), false);
same("0", parseVatRegistered("0"), false);

console.log("\n[vat] คอลัมน์สาขา");
same("null = จด VAT", parseBranchVatFlag(null), true);
same("undefined = จด VAT", parseBranchVatFlag(undefined), true);
same("true", parseBranchVatFlag(true), true);
same("false", parseBranchVatFlag(false), false);

console.log("\n[vat] ยังไม่จด — ทุกเอกสาร 0%, ออกใบกำกับไม่ได้");
same("ออก TAX ไม่ได้", canIssueTaxInvoice(false), false);
same("QA", documentVatRate(false, "QUOTATION", true), 0);
same("INV แม้ขอ VAT", documentVatRate(false, "INVOICE", true), 0);
same("TAX ถูกบังคับ 0 ฝั่งอัตรา (กันออกที่ action)", documentVatRate(false, "TAX_INVOICE", true), 0);

console.log("\n[vat] จดแล้ว — QA/DO ไม่คิด, TAX บังคับ 7%");
same("QA", documentVatRate(true, "QUOTATION", true), 0);
same("DO", documentVatRate(true, "DO", true), 0);
same("TAX บังคับแม้ขอเงินสด", documentVatRate(true, "TAX_INVOICE", false), STANDARD_VAT_RATE);
same("เลือกได้ที่ INV", vatChoiceAllowed("INVOICE"), true);
same("เลือกได้ที่ใบลดหนี้", vatChoiceAllowed("CREDIT_NOTE"), true);
same("เลือกไม่ได้ที่ TAX", vatChoiceAllowed("TAX_INVOICE"), false);

console.log("\n[vat] ค่าเริ่มต้นต่อประเภท (จดแล้ว)");
same("INV เริ่ม VAT", defaultChargeVat(true, "INVOICE"), true);
same("BL เริ่ม VAT", defaultChargeVat(true, "BILLING_NOTE"), true);
same("REC เริ่มเงินสด", defaultChargeVat(true, "RECEIPT"), false);
same("QA เริ่มเงินสด", defaultChargeVat(true, "QUOTATION"), false);

console.log("\n[vat] เลือกต่อใบเมื่อจดแล้ว");
same("INV เงินสด", documentVatRate(true, "INVOICE", false), 0);
same("INV VAT", documentVatRate(true, "INVOICE", true), STANDARD_VAT_RATE);
same("REC VAT", documentVatRate(true, "RECEIPT", true), STANDARD_VAT_RATE);
same("REC ไม่ระบุ = เงินสด", documentVatRate(true, "RECEIPT"), 0);
same("INV ไม่ระบุ = VAT", documentVatRate(true, "INVOICE"), STANDARD_VAT_RATE);

console.log("\n[vat] ยอดบนเอกสาร ฐาน 1,000");
const cash = settleDocumentVat(1000, 0);
eq("เงินสด VAT", cash.vatAmount, 0);
eq("เงินสด สุทธิ", cash.grandTotal, 1000);
const billed = settleDocumentVat(1000, 7);
eq("VAT 7%", billed.vatAmount, 70);
eq("สุทธิรวม VAT", billed.grandTotal, 1070);

if (failures) {
  console.log(`\nล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\nผ่านทั้งหมด");
}
