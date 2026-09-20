#!/usr/bin/env node
/**
 * Backfill แถว receipt_staging JSON ที่มี postedRequestId/postedFingerprint ไป sc_receipt_posts
 * ค่าเริ่มต้น dry-run; ใช้ --apply เท่านั้นจึงเขียน และเขียนผ่าน sc_fn_post_receipt เพื่อกันซ้ำ
 */
import { createClient } from "@supabase/supabase-js";

const { planBackfillLedgerFromQueue, reconReceiptBooks } = await import(
  new URL("../.test-build/receipt-ledger.js", import.meta.url).href
);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("ต้องรันด้วย .env.local ที่มี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const { data: settings, error: settingsError } = await supabase
  .from("sc_settings")
  .select("tenant_id, value")
  .eq("key", "receipt_staging");
if (settingsError) throw new Error(`อ่าน receipt_staging ไม่สำเร็จ: ${settingsError.message}`);

let plannedTotal = 0;
let failures = 0;
const summaries = [];

for (const setting of settings ?? []) {
  const tenantId = String(setting.tenant_id || "").trim();
  if (!tenantId) {
    console.error("พบ receipt_staging ที่ไม่มี tenant_id — หยุด");
    failures++;
    continue;
  }

  let queue;
  try {
    const parsed = JSON.parse(String(setting.value || "[]"));
    if (!Array.isArray(parsed)) throw new Error("ค่าไม่ใช่ array");
    queue = parsed;
  } catch (error) {
    console.error(`[${tenantId}] JSON อ่านไม่ได้: ${error.message}`);
    failures++;
    continue;
  }

  const { data: existing, error: ledgerError } = await supabase
    .from("sc_receipt_posts")
    .select("receipt_id, request_id, fingerprint")
    .eq("tenant_id", tenantId);
  if (ledgerError) {
    console.error(`[${tenantId}] อ่าน ledger ไม่สำเร็จ: ${ledgerError.message}`);
    failures++;
    continue;
  }

  const ledger = (existing ?? []).map((row) => ({
    receiptId: row.receipt_id,
    requestId: row.request_id,
    fingerprint: row.fingerprint,
  }));
  const before = reconReceiptBooks(queue, ledger);
  const plan = planBackfillLedgerFromQueue(tenantId, queue).filter(
    (row) => !ledger.some((existingRow) => existingRow.receiptId === row.receiptId)
  );
  plannedTotal += plan.length;

  if (before.fingerprintMismatch.length > 0) {
    console.error(`[${tenantId}] fingerprint/request mismatch: ${before.fingerprintMismatch.join(", ")}`);
    failures++;
    continue;
  }

  console.log(
    `[${tenantId}] queue=${queue.length} ledger=${ledger.length} ` +
      `missing=${before.postedInQueueMissingLedger.length} plan=${plan.length}`
  );

  if (apply) {
    for (const row of plan) {
      const { data, error } = await supabase.rpc("sc_fn_post_receipt", {
        p_tenant_id: row.tenantId,
        p_receipt_id: row.receiptId,
        p_request_id: row.requestId,
        p_fingerprint: row.fingerprint,
        p_purchase_amount: row.purchaseAmount,
        p_vat_credit: row.vatCredit,
        p_approved_by: row.approvedBy ?? null,
      });
      if (error || !data?.[0]) {
        console.error(`[${tenantId}] backfill ${row.receiptId} ล้มเหลว: ${error?.message || "RPC ไม่คืนแถว"}`);
        failures++;
        break;
      }
      console.log(`  ✓ ${row.receiptId} ${data[0].replay ? "replay" : "insert"}`);
    }
  }

  summaries.push({ tenantId, queue });
}

if (failures > 0) {
  throw new Error(`หยุด: พบ ${failures} ปัญหา`);
}

if (!apply) {
  console.log(`\nDRY-RUN: จะ backfill ${plannedTotal} แถว — ยังไม่ได้เขียนข้อมูล`);
  console.log("รันซ้ำด้วย --apply หลังตรวจยอดแล้วเท่านั้น");
} else {
  let remaining = 0;
  for (const summary of summaries) {
    const { data, error } = await supabase
      .from("sc_receipt_posts")
      .select("receipt_id, request_id, fingerprint")
      .eq("tenant_id", summary.tenantId);
    if (error) throw new Error(`อ่าน ledger หลังกระทบยอดไม่สำเร็จ: ${error.message}`);
    const after = reconReceiptBooks(
      summary.queue,
      (data ?? []).map((row) => ({ receiptId: row.receipt_id, requestId: row.request_id, fingerprint: row.fingerprint }))
    );
    const gaps = after.postedInQueueMissingLedger.length + after.fingerprintMismatch.length;
    remaining += gaps;
    console.log(`[${summary.tenantId}] หลัง backfill missing=${after.postedInQueueMissingLedger.length} mismatch=${after.fingerprintMismatch.length}`);
  }

  if (remaining > 0) {
    throw new Error(`กระทบยอดไม่ผ่าน: ยังเหลือ ${remaining} ช่องว่าง`);
  }
  console.log(`\nสำเร็จ: backfill ${plannedTotal} แถว และช่องว่างเป็นศูนย์`);
}