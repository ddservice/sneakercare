#!/usr/bin/env node
const {
  classifyReceipt,
  isDuplicateReceipt,
  planInAppReceiptOcr,
  planPostStagedReceipt,
  receiptFingerprint,
  reviewReceipt,
  vatCreditAmount,
} = await import(new URL("../.test-build/receipt-staging.js", import.meta.url).href);

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

console.log("\n[receipts] จำแนกและภาษีซื้อ");
check(classifyReceipt(null) === "unclassified", "ไม่เดาประเภทบัญชี", classifyReceipt(null));
check(vatCreditAmount({ vatAmount: 70, isFullTaxInvoice: false, userConfirmedVatCredit: true }) === 0, "ใบไม่เต็มรูปใช้เครดิตไม่ได้", "ใช้เครดิตได้");
check(vatCreditAmount({ vatAmount: 70, isFullTaxInvoice: true, userConfirmedVatCredit: false }) === 0, "ยังไม่ยืนยันเครดิต = 0", "ถูกยืนยันเอง");
check(vatCreditAmount({ vatAmount: 70, isFullTaxInvoice: true, userConfirmedVatCredit: true }) === 70, "ใบกำกับเต็มรูปที่ยืนยันแล้วเครดิตได้", "เครดิตไม่ได้");
check(!planInAppReceiptOcr().ok, "OCR ในแอปห้ามเดายอด", "OCR เดาได้");

const base = {
  id: "r1",
  date: "2026-09-10",
  vendorName: "บจก. ตัวอย่าง",
  vendorTaxId: "0105558123456",
  invoiceNumber: "INV-1",
  baseAmount: 1000,
  vatAmount: 70,
  totalAmount: 1070,
  source: "ocr",
  purchaseClass: "unclassified",
  isFullTaxInvoice: false,
  userConfirmedVatCredit: false,
  approved: false,
};

console.log("\n[receipts] ตรวจและลงสมุด");
check(reviewReceipt(base) === "pending_review", "OCR ที่ยังไม่จำแนก = รอตรวจ", reviewReceipt(base));
check(isDuplicateReceipt([{ ...base, id: "r0" }], { ...base, id: "r2" }), "ใบเลขเดียวกันซ้ำ", "ไม่จับซ้ำ");

const ready = { ...base, purchaseClass: "goods", approved: true, isFullTaxInvoice: true, userConfirmedVatCredit: true };
check(reviewReceipt(ready) === "ready_to_post", "ครบและอนุมัติแล้วพร้อมลง", reviewReceipt(ready));

const blocked = planPostStagedReceipt({ line: base, existing: [], requestId: "req-1" });
check(!blocked.ok, "ข้อมูลไม่ครบลงสมุดไม่ได้", "ลงได้ทั้งที่ยังเดา");

const posted = planPostStagedReceipt({ line: ready, existing: [], requestId: "req-1" });
check(posted.ok && posted.posted.vatCredit === 70 && posted.posted.purchaseAmount === 1070, "ลงสมุดแยกยอดซื้อกับเครดิต VAT", JSON.stringify(posted));

const replay = planPostStagedReceipt({
  line: { ...ready, postedRequestId: "req-1", postedFingerprint: receiptFingerprint(ready) },
  existing: [],
  requestId: "req-1",
});
check(replay.ok && replay.replay, "คีย์เดิมไม่ลงซ้ำ", "ลงซ้ำ");

const conflict = planPostStagedReceipt({
  line: {
    ...ready,
    vatAmount: 80,
    postedRequestId: "req-1",
    postedFingerprint: receiptFingerprint(ready),
  },
  existing: [],
  requestId: "req-1",
});
check(!conflict.ok && conflict.kind === "conflict", "คีย์เดิม payload ต่าง = conflict", JSON.stringify(conflict));

if (failures) {
  console.log(`\n[receipts] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[receipts] ผ่านทั้งหมด");
}
