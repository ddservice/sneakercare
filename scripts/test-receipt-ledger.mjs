#!/usr/bin/env node
const {
  applyLedgerToQueue,
  isProductionDatabaseUrl,
  needsPurchaseVatProjection,
  parseReceiptLedgerError,
  planBackfillLedgerFromQueue,
  queueCasFailureAfterLedgerCommit,
  reconReceiptBooks,
  vatProjectionFailureAfterLedgerCommit,
} = await import(new URL("../.test-build/receipt-ledger.js", import.meta.url).href);

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

const line = {
  id: "r1",
  date: "2026-09-10",
  vendorName: "บจก. ตัวอย่าง",
  vendorTaxId: "0105558123456",
  invoiceNumber: "INV-1",
  baseAmount: 1000,
  vatAmount: 70,
  totalAmount: 1070,
  source: "manual",
  purchaseClass: "goods",
  isFullTaxInvoice: true,
  userConfirmedVatCredit: true,
  approved: true,
};

console.log("\n[receipt-ledger] แหล่งหลักและภาพฉาย");
check(!isProductionDatabaseUrl("postgres://user@localhost:5432/rrs_test"), "ฐานทดสอบ local ไม่ถือว่า production", "local ถูกกันผิด");
check(isProductionDatabaseUrl("postgresql://postgres.abc@aws-0.pooler.supabase.co:6543/postgres"), "URL บน supabase.co ถือว่า production", "ไม่กัน production");
check(isProductionDatabaseUrl("postgres://mdlxogfkpwejnqpzhmoy.example/db"), "รหัสโปรเจกต์ production ถูกกัน", "ไม่กันรหัสโปรเจกต์");

const queued = applyLedgerToQueue([line], [
  { receiptId: "r1", requestId: "req-1", fingerprint: "fp-a" },
]);
check(queued[0].postedRequestId === "req-1", "อ่านคิวแล้วตารางเป็นคนบอกว่าลงแล้ว", queued[0].postedRequestId);
check(queued[0].approved === true, "แถวในตารางถือว่าอนุมัติแล้ว", String(queued[0].approved));

const missing = reconReceiptBooks([{ ...line, postedRequestId: "req-1", postedFingerprint: "fp-a" }], []);
check(missing.postedInQueueMissingLedger[0] === "r1", "JSON ลงแล้วแต่ตารางว่างต้องโชว์ช่องว่าง", JSON.stringify(missing));

const flagGap = reconReceiptBooks([line], [{ receiptId: "r1", requestId: "req-1", fingerprint: "fp-a" }]);
check(flagGap.postedInLedgerMissingQueueFlag[0] === "r1", "ตารางมีแล้วแต่คิวยังไม่ป้าย ต้องกระทบยอดได้", JSON.stringify(flagGap));

const mismatch = reconReceiptBooks(
  [{ ...line, postedRequestId: "req-1", postedFingerprint: "fp-old" }],
  [{ receiptId: "r1", requestId: "req-1", fingerprint: "fp-a" }]
);
check(mismatch.fingerprintMismatch[0] === "r1", "ลายนิ้วมือไม่ตรงต้อง conflict", JSON.stringify(mismatch));

const backfill = planBackfillLedgerFromQueue("t1", [
  { ...line, postedRequestId: "req-1", postedFingerprint: "fp-a" },
  line,
]);
check(backfill.length === 1 && backfill[0].receiptId === "r1" && backfill[0].vatCredit === 70, "backfill เฉพาะใบที่ JSON บอกว่าลงแล้ว", JSON.stringify(backfill));

check(
  needsPurchaseVatProjection({ vatCredit: 70, receiptId: "r1", vatLines: [] }),
  "ยังไม่มีบรรทัดภาษีซื้อต้องเขียนภาพฉาย",
  "ข้ามภาษีซื้อ"
);
check(
  !needsPurchaseVatProjection({ vatCredit: 70, receiptId: "r1", vatLines: [{ id: "r1" }] }),
  "มีบรรทัดภาษีซื้อแล้วไม่เขียนซ้ำ",
  "เขียนซ้ำ"
);
check(
  needsPurchaseVatProjection({ vatCredit: 70, receiptId: "r1", vatLines: [{ id: "r1", voided: true }] }),
  "บรรทัดที่ยกเลิกแล้วต้องเขียนใหม่ได้",
  "ข้ามทั้งที่ void"
);

check(parseReceiptLedgerError("คีย์กันซ้ำเดิมแต่ข้อมูลไม่ตรง — ห้ามลงซ้ำ").kind === "conflict", "RPC conflict ไม่ถูกป้ายว่าลงสมุด", "kind ผิด");
check(queueCasFailureAfterLedgerCommit().includes("ลงสมุดแล้ว"), "CAS คิวพังหลังตาราง commit แล้วยังบอกว่าลงสมุด", "ข้อความไม่บอกแหล่งหลัก");
check(vatProjectionFailureAfterLedgerCommit("cas").includes("กดลงอีกครั้งจะไม่ซ้ำใบ"), "ภาษีซื้อพังแล้วยังกันซ้ำที่ตาราง", "ไม่มีทาง retry");

if (failures) {
  console.log(`\n[receipt-ledger] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[receipt-ledger] ผ่านทั้งหมด");
}
