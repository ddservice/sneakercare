/** แหล่งหลักของการลงสมุดใบเสร็จ = แถวใน sc_receipt_posts ผ่าน sc_fn_post_receipt
 * JSON คิวใน sc_settings เป็นภาพฉาย — ห้ามใช้เป็นตัวกันซ้ำแทนตาราง
 */

import { moneyNumber } from "./money";
import { vatCreditAmount, type StagedReceipt } from "./receipt-staging";

export type ReceiptLedgerRow = {
  tenantId: string;
  receiptId: string;
  requestId: string;
  fingerprint: string;
  purchaseAmount: number;
  vatCredit: number;
  approvedBy?: string | null;
};

export type ReceiptRecon = {
  postedInQueueMissingLedger: string[];
  postedInLedgerMissingQueueFlag: string[];
  fingerprintMismatch: string[];
};

function money(n: number): number {
  return moneyNumber(Number(n) || 0);
}

export function isProductionDatabaseUrl(url: string): boolean {
  const value = String(url || "");
  if (!value) return false;
  if (/supabase\.co/i.test(value)) return true;
  if (/mdlxogfkpwejnqpzhmoy/i.test(value)) return true;
  return false;
}

export function applyLedgerToQueue(
  queue: readonly StagedReceipt[],
  ledger: readonly Pick<ReceiptLedgerRow, "receiptId" | "requestId" | "fingerprint">[]
): StagedReceipt[] {
  const byId = new Map(ledger.map((row) => [row.receiptId, row]));
  return queue.map((line) => {
    const posted = byId.get(line.id);
    if (!posted) return line;
    return {
      ...line,
      postedRequestId: posted.requestId,
      postedFingerprint: posted.fingerprint,
      approved: true,
    };
  });
}

export function reconReceiptBooks(
  queue: readonly StagedReceipt[],
  ledger: readonly Pick<ReceiptLedgerRow, "receiptId" | "requestId" | "fingerprint">[]
): ReceiptRecon {
  const ledgerById = new Map(ledger.map((row) => [row.receiptId, row]));
  const postedInQueueMissingLedger: string[] = [];
  const fingerprintMismatch: string[] = [];
  for (const line of queue) {
    if (!line.postedRequestId) continue;
    const row = ledgerById.get(line.id);
    if (!row) {
      postedInQueueMissingLedger.push(line.id);
      continue;
    }
    if (row.fingerprint !== line.postedFingerprint || row.requestId !== line.postedRequestId) {
      fingerprintMismatch.push(line.id);
    }
  }
  const postedInLedgerMissingQueueFlag: string[] = [];
  for (const row of ledger) {
    const line = queue.find((item) => item.id === row.receiptId);
    if (!line) continue;
    if (!line.postedRequestId) postedInLedgerMissingQueueFlag.push(row.receiptId);
  }
  return { postedInQueueMissingLedger, postedInLedgerMissingQueueFlag, fingerprintMismatch };
}

export function planBackfillLedgerFromQueue(
  tenantId: string,
  queue: readonly StagedReceipt[]
): ReceiptLedgerRow[] {
  return queue.flatMap((line) => {
    const requestId = String(line.postedRequestId || "").trim();
    const fingerprint = String(line.postedFingerprint || "").trim();
    if (!requestId || !fingerprint) return [];
    return [
      {
        tenantId,
        receiptId: line.id,
        requestId,
        fingerprint,
        purchaseAmount: money(line.totalAmount || line.baseAmount),
        vatCredit: vatCreditAmount(line),
        approvedBy: line.approvedBy ?? null,
      },
    ];
  });
}

export function needsPurchaseVatProjection(input: {
  vatCredit: number;
  receiptId: string;
  vatLines: readonly { id: string; voided?: boolean }[];
}): boolean {
  if (!(money(input.vatCredit) > 0)) return false;
  return !input.vatLines.some((row) => row.id === input.receiptId && !row.voided);
}

export function parseReceiptLedgerError(message: string): { kind: "conflict" | "error"; error: string } {
  const text = String(message || "").trim() || "ลงสมุดไม่สำเร็จ";
  if (
    /คีย์กันซ้ำ/.test(text) ||
    /ข้อมูลไม่ตรง/.test(text) ||
    /ลงสมุดแล้วด้วยคีย์อื่น/.test(text) ||
    /duplicate key/i.test(text) ||
    /23505/.test(text) ||
    /23514/.test(text)
  ) {
    return { kind: "conflict", error: text };
  }
  return { kind: "error", error: text };
}

export function queueCasFailureAfterLedgerCommit(): string {
  return "ลงสมุดแล้ว (ใบไม่ซ้ำที่ตาราง) คิวหน้าจอยังไม่อัปเดต — โหลดใหม่ ห้ามสร้างใบใหม่";
}

export function vatProjectionFailureAfterLedgerCommit(detail: string): string {
  return `ลงสมุดแล้วแต่สมุดภาษีซื้อยังไม่เข้า: ${detail} — กดลงอีกครั้งจะไม่ซ้ำใบ`;
}
