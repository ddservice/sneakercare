#!/usr/bin/env node
/**
 * ย้าย JSON ที่ลงสมุดแล้วเข้า sc_receipt_posts บนฐานทดสอบ แล้วกระทบยอด
 * PGlite เอนจินเดียว — ไม่ใช่สอง session ของ Postgres จริง
 */
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const {
  applyLedgerToQueue,
  isProductionDatabaseUrl,
  planBackfillLedgerFromQueue,
  reconReceiptBooks,
} = await import(new URL("../.test-build/receipt-ledger.js", import.meta.url).href);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = fs.readFileSync(path.join(root, "supabase/migrations/0046_receipt_posts_and_live_guards.sql"), "utf8");

const T1 = "00000000-0000-0000-0000-000000000001";
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

const postedLine = {
  id: "r-json",
  date: "2026-09-10",
  vendorName: "บจก. เก่า",
  vendorTaxId: "0105558000001",
  invoiceNumber: "OLD-1",
  baseAmount: 1000,
  vatAmount: 70,
  totalAmount: 1070,
  source: "manual",
  purchaseClass: "goods",
  isFullTaxInvoice: true,
  userConfirmedVatCredit: true,
  approved: true,
  postedRequestId: "req-old",
  postedFingerprint: "2026-09-10|0105558000001|OLD-1|1000.00|70.00|goods|1|1",
};

console.log("\n[receipt-cutover] backfill + กระทบยอด");
check(!isProductionDatabaseUrl(""), "ไม่มี URL แล้วไม่ถือว่า production", "ว่างถูกกันผิด");

const db = new PGlite();
await db.exec(`
  create table public.sc_settings (
    tenant_id uuid not null,
    key text not null,
    value text,
    primary key (tenant_id, key)
  );
`);
await db.exec(sql);
await db.query("insert into public.sc_settings (tenant_id, key, value) values ($1, 'receipt_staging', $2)", [
  T1,
  JSON.stringify([postedLine, { ...postedLine, id: "r-open", postedRequestId: undefined, postedFingerprint: undefined, approved: false }]),
]);

const settings = await db.query("select value from public.sc_settings where tenant_id = $1 and key = 'receipt_staging'", [T1]);
const queue = JSON.parse(settings.rows[0].value);
const planned = planBackfillLedgerFromQueue(T1, queue);
check(planned.length === 1 && planned[0].receiptId === "r-json", "แผน backfill ไม่กินใบที่ยังไม่ลงสมุด", JSON.stringify(planned));

for (const row of planned) {
  await db.query("select * from public.sc_fn_post_receipt($1,$2,$3,$4,$5,$6,$7)", [
    row.tenantId,
    row.receiptId,
    row.requestId,
    row.fingerprint,
    row.purchaseAmount,
    row.vatCredit,
    null,
  ]);
}

const replay = await db.query("select * from public.sc_fn_post_receipt($1,$2,$3,$4,$5,$6,$7)", [
  planned[0].tenantId,
  planned[0].receiptId,
  planned[0].requestId,
  planned[0].fingerprint,
  planned[0].purchaseAmount,
  planned[0].vatCredit,
  null,
]);
check(replay.rows[0]?.replay === true || replay.rows[0]?.replay === "t", "backfill ซ้ำเป็น replay ไม่เพิ่มแถว", JSON.stringify(replay.rows[0]));

const ledgerRes = await db.query(
  "select receipt_id as \"receiptId\", request_id as \"requestId\", fingerprint from public.sc_receipt_posts where tenant_id = $1",
  [T1]
);
const reconBeforeOverlay = reconReceiptBooks(queue, ledgerRes.rows);
check(reconBeforeOverlay.postedInQueueMissingLedger.length === 0, "หลัง backfill ไม่มี JSON ที่ตารางไม่มี", JSON.stringify(reconBeforeOverlay));
check(reconBeforeOverlay.fingerprintMismatch.length === 0, "ลายนิ้วมือ JSON กับตารางตรงกัน", JSON.stringify(reconBeforeOverlay));

const overlay = applyLedgerToQueue(queue, ledgerRes.rows);
const reconAfter = reconReceiptBooks(overlay, ledgerRes.rows);
check(
  reconAfter.postedInLedgerMissingQueueFlag.length === 0 && overlay.find((row) => row.id === "r-json")?.postedRequestId === "req-old",
  "ตัดไฟล์แล้วคิวตามตาราง ผู้ใช้ที่เปิดค้างเห็นว่าลงแล้ว",
  JSON.stringify(reconAfter)
);
check(!overlay.find((row) => row.id === "r-open")?.postedRequestId, "ใบที่ยังไม่ลงสมุดไม่ถูกป้ายจาก backfill", "ป้ายผิด");

const n = await db.query("select count(*)::int as n from public.sc_receipt_posts where tenant_id = $1", [T1]);
check(Number(n.rows[0].n) === 1, "ตารางมีหนึ่งแถวต่อกิจการหลังย้าย", String(n.rows[0].n));

const actionSrc = fs.readFileSync(path.join(root, "app/actions/receipt-staging.ts"), "utf8");
check(actionSrc.includes("sc_fn_post_receipt") || actionSrc.includes("postReceiptToLedger"), "เส้นทางแอปเรียกตาราง/RPC ไม่ใช่แค่ CAS", "ยังไม่เรียก RPC");
check(!actionSrc.includes("writeStagedReceipts(tenantId, current)"), "vat พังแล้วไม่ rollback แถวตารางด้วยการคืน JSON", "ยังคืน JSON ทับแหล่งหลัก");

const url = process.env.TEST_DATABASE_URL || "";
if (!url) {
  console.log("  • ไม่รันสอง connection — ไม่มี TEST_DATABASE_URL");
} else if (isProductionDatabaseUrl(url)) {
  bad("TEST_DATABASE_URL ชี้ production — ปฏิเสธ ไม่รัน");
} else {
  console.log("  • มี TEST_DATABASE_URL แต่ชุดนี้ใช้ PGlite สำหรับ backfill — สอง connection อยู่ที่ test:migration 0046");
}

if (failures) {
  console.log(`\n[receipt-cutover] ล้ม ${failures} ข้อ`);
  process.exitCode = 1;
} else {
  console.log("\n[receipt-cutover] ผ่านชุดที่รัน");
}
