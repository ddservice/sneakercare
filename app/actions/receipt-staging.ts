"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { assertPeriodOpen } from "@/lib/period-close-store";
import {
  classifyReceipt,
  isDuplicateReceipt,
  planPostStagedReceipt,
  reviewReceipt,
  type PurchaseClass,
  type StagedReceipt,
} from "@/lib/receipt-staging";
import { planAddPurchaseVat } from "@/lib/purchase-vat";
import { readPurchaseVatLinesState, writePurchaseVatLinesCas } from "@/lib/purchase-vat-store";
import {
  readStagedReceipts,
  readStagedReceiptsState,
  upsertStagedReceipt,
  writeStagedReceiptsCas,
} from "@/lib/receipt-staging-store";
import {
  applyLedgerToQueue,
  needsPurchaseVatProjection,
  queueCasFailureAfterLedgerCommit,
  vatProjectionFailureAfterLedgerCommit,
} from "@/lib/receipt-ledger";
import { postReceiptToLedger, readReceiptLedger } from "@/lib/receipt-ledger-store";

export async function fetchStagedReceipts(): Promise<StagedReceipt[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  const tenantId = await tenantFilter(profile);
  if (!tenantId) return [];
  return readStagedReceipts(tenantId);
}

export async function stageReceipt(input: {
  date: string;
  vendorName: string;
  vendorTaxId: string;
  invoiceNumber: string;
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
  source: "manual" | "ocr";
  purchaseClass?: PurchaseClass;
  isFullTaxInvoice?: boolean;
  userConfirmedVatCredit?: boolean;
}): Promise<{ success: true; receipts: StagedReceipt[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const closedErr = await assertPeriodOpen(tenantId, input.date);
  if (closedErr) return { success: false, error: closedErr };
  const { raw, receipts: current } = await readStagedReceiptsState(tenantId);
  const line: StagedReceipt = {
    id: crypto.randomUUID(),
    date: String(input.date || "").trim(),
    vendorName: String(input.vendorName || "").trim(),
    vendorTaxId: String(input.vendorTaxId || "").replace(/\D/g, ""),
    invoiceNumber: String(input.invoiceNumber || "").trim(),
    baseAmount: Number(input.baseAmount || 0),
    vatAmount: Number(input.vatAmount || 0),
    totalAmount: Number(input.totalAmount || 0),
    source: input.source === "ocr" ? "ocr" : "manual",
    purchaseClass: classifyReceipt(input.purchaseClass),
    isFullTaxInvoice: input.isFullTaxInvoice === true,
    userConfirmedVatCredit: input.userConfirmedVatCredit === true,
    approved: false,
  };
  if (isDuplicateReceipt(current, line)) {
    return { success: false, error: "ใบเสร็จนี้ซ้ำกับรายการในคิว (ผู้ขาย + เลขที่ + วันที่)" };
  }
  const next = upsertStagedReceipt(current, line);
  const cas = await writeStagedReceiptsCas(tenantId, raw, next);
  if (!cas.ok) return { success: false, error: cas.error };
  await logAudit({
    action: "CREATE",
    entity: "settings",
    entity_id: `receipt:${line.id}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "receipt_staging", status: reviewReceipt(line, next), source: line.source },
  });
  revalidatePath("/tax-filing");
  return { success: true, receipts: next };
}

export async function reviewStagedReceipt(input: {
  id: string;
  purchaseClass: PurchaseClass;
  isFullTaxInvoice: boolean;
  userConfirmedVatCredit: boolean;
  approved: boolean;
}): Promise<{ success: true; receipts: StagedReceipt[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const { raw, receipts: current } = await readStagedReceiptsState(tenantId);
  const ledger = await readReceiptLedger(tenantId);
  const merged = applyLedgerToQueue(current, ledger);
  const existing = merged.find((row) => row.id === input.id);
  if (!existing) return { success: false, error: "ไม่พบใบเสร็จในคิว" };
  if (existing.postedRequestId) return { success: false, error: "รายการนี้ลงสมุดแล้ว แก้ไม่ได้" };
  const closedErr = await assertPeriodOpen(tenantId, existing.date);
  if (closedErr) return { success: false, error: closedErr };
  const nextLine: StagedReceipt = {
    ...existing,
    purchaseClass: classifyReceipt(input.purchaseClass),
    isFullTaxInvoice: input.isFullTaxInvoice === true,
    userConfirmedVatCredit: input.userConfirmedVatCredit === true,
    approved: input.approved === true,
    approvedBy: input.approved ? profile.id : existing.approvedBy,
  };
  const next = upsertStagedReceipt(current, nextLine);
  const cas = await writeStagedReceiptsCas(tenantId, raw, next);
  if (!cas.ok) return { success: false, error: cas.error };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `receipt:${nextLine.id}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: {
      setting: "receipt_staging",
      status: reviewReceipt(nextLine, next),
      purchaseClass: nextLine.purchaseClass,
      approvedBy: nextLine.approvedBy,
    },
  });
  revalidatePath("/tax-filing");
  return { success: true, receipts: next };
}

export async function postStagedReceipt(
  id: string
): Promise<{ success: true; receipts: StagedReceipt[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const { raw, receipts: current } = await readStagedReceiptsState(tenantId);
  const ledger = await readReceiptLedger(tenantId);
  const merged = applyLedgerToQueue(current, ledger);
  const existing = merged.find((row) => row.id === id);
  if (!existing) return { success: false, error: "ไม่พบใบเสร็จในคิว" };
  const closedErr = await assertPeriodOpen(tenantId, existing.date);
  if (closedErr) return { success: false, error: closedErr };
  const planned = planPostStagedReceipt({
    line: existing,
    existing: merged,
    requestId: existing.postedRequestId || existing.id,
  });
  if (!planned.ok) return { success: false, error: planned.error };

  const ledgerPost = await postReceiptToLedger({
    tenantId,
    receiptId: existing.id,
    requestId: planned.posted.requestId,
    fingerprint: planned.posted.fingerprint,
    purchaseAmount: planned.posted.purchaseAmount,
    vatCredit: planned.posted.vatCredit,
    approvedBy: existing.approvedBy || profile.id,
  });
  if (!ledgerPost.ok) return { success: false, error: ledgerPost.error };

  const postedLine: StagedReceipt = {
    ...existing,
    postedRequestId: planned.posted.requestId,
    postedFingerprint: planned.posted.fingerprint,
    approved: true,
    approvedBy: existing.approvedBy || profile.id,
  };
  const nextReceipts = upsertStagedReceipt(current, postedLine);
  const cas = await writeStagedReceiptsCas(tenantId, raw, nextReceipts);
  let receipts = applyLedgerToQueue(nextReceipts, [
    ...ledger,
    {
      receiptId: postedLine.id,
      requestId: planned.posted.requestId,
      fingerprint: planned.posted.fingerprint,
    },
  ]);
  if (!cas.ok) {
    const latest = await readStagedReceiptsState(tenantId);
    receipts = applyLedgerToQueue(latest.receipts, [
      ...ledger,
      {
        receiptId: postedLine.id,
        requestId: planned.posted.requestId,
        fingerprint: planned.posted.fingerprint,
      },
    ]);
  }

  const vatState = await readPurchaseVatLinesState(tenantId);
  if (
    needsPurchaseVatProjection({
      vatCredit: planned.posted.vatCredit,
      receiptId: postedLine.id,
      vatLines: vatState.lines,
    })
  ) {
    const vatPlan = planAddPurchaseVat(vatState.lines, {
      id: postedLine.id,
      date: postedLine.date,
      vendorName: postedLine.vendorName,
      vendorTaxId: postedLine.vendorTaxId,
      invoiceNumber: postedLine.invoiceNumber,
      baseAmount: postedLine.baseAmount,
      vatAmount: planned.posted.vatCredit,
    });
    if (!vatPlan.ok) {
      return { success: false, error: vatProjectionFailureAfterLedgerCommit(vatPlan.error) };
    }
    const vatCas = await writePurchaseVatLinesCas(tenantId, vatState.raw, vatPlan.next);
    if (!vatCas.ok) {
      return { success: false, error: vatProjectionFailureAfterLedgerCommit(vatCas.error) };
    }
  }

  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `receipt:${postedLine.id}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: {
      setting: "receipt_staging",
      posted: true,
      replay: ledgerPost.replay,
      sourceOfTruth: "sc_receipt_posts",
      queueCas: cas.ok,
      purchaseClass: planned.posted.purchaseClass,
      vatCredit: planned.posted.vatCredit,
      purchaseAmount: planned.posted.purchaseAmount,
      approvedBy: postedLine.approvedBy,
      fingerprint: planned.posted.fingerprint,
      queueNote: cas.ok ? undefined : queueCasFailureAfterLedgerCommit(),
    },
  });
  revalidatePath("/tax-filing");
  return { success: true, receipts };
}
