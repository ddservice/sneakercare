import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseReceiptLedgerError,
  type ReceiptLedgerRow,
} from "@/lib/receipt-ledger";

export async function readReceiptLedger(tenantId: string): Promise<ReceiptLedgerRow[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("sc_receipt_posts")
    .select("tenant_id, receipt_id, request_id, fingerprint, purchase_amount, vat_credit, approved_by")
    .eq("tenant_id", tenantId);
  if (error) {
    throw new Error(`อ่านสมุดซื้อไม่สำเร็จ: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    tenantId: row.tenant_id,
    receiptId: row.receipt_id,
    requestId: row.request_id,
    fingerprint: row.fingerprint,
    purchaseAmount: Number(row.purchase_amount || 0),
    vatCredit: Number(row.vat_credit || 0),
    approvedBy: row.approved_by,
  }));
}

export async function postReceiptToLedger(
  row: ReceiptLedgerRow
): Promise<
  | { ok: true; replay: boolean; purchaseAmount: number; vatCredit: number }
  | { ok: false; kind: "conflict" | "error"; error: string }
> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("sc_fn_post_receipt", {
    p_tenant_id: row.tenantId,
    p_receipt_id: row.receiptId,
    p_request_id: row.requestId,
    p_fingerprint: row.fingerprint,
    p_purchase_amount: row.purchaseAmount,
    p_vat_credit: row.vatCredit,
    p_approved_by: row.approvedBy ?? null,
  });
  if (error) return { ok: false, ...parseReceiptLedgerError(error.message) };
  const posted = data?.[0];
  if (!posted) return { ok: false, kind: "error", error: "RPC ลงสมุดไม่คืนแถว" };
  return {
    ok: true,
    replay: posted.replay === true,
    purchaseAmount: Number(posted.purchase_amount || 0),
    vatCredit: Number(posted.vat_credit || 0),
  };
}
