/** ใบเสร็จเข้า staging — ห้ามเดายอด/ประเภท และห้ามถือว่าทุกใบใช้เครดิต VAT ได้ */

import { moneyNumber } from "./money";

export type PurchaseClass = "goods" | "opex" | "asset" | "unclassified";

export type StagedReceipt = {
  id: string;
  date: string;
  vendorName: string;
  vendorTaxId: string;
  invoiceNumber: string;
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
  source: "manual" | "ocr";
  purchaseClass: PurchaseClass;
  isFullTaxInvoice: boolean;
  userConfirmedVatCredit: boolean;
  approved: boolean;
  postedRequestId?: string;
  postedFingerprint?: string;
  approvedBy?: string;
};

export type ReceiptReviewStatus = "pending_review" | "ready_to_post" | "posted";

function money(n: number): number {
  return moneyNumber(Number(n) || 0);
}

export function classifyReceipt(userClass: PurchaseClass | null | undefined): PurchaseClass {
  if (userClass === "goods" || userClass === "opex" || userClass === "asset") return userClass;
  return "unclassified";
}

export function vatCreditAmount(
  line: Pick<StagedReceipt, "vatAmount" | "isFullTaxInvoice" | "userConfirmedVatCredit">
): number {
  if (!line.isFullTaxInvoice) return 0;
  if (!line.userConfirmedVatCredit) return 0;
  const vat = money(line.vatAmount);
  return vat > 0 ? vat : 0;
}

export function receiptFingerprint(
  line: Pick<
    StagedReceipt,
    "date" | "vendorTaxId" | "invoiceNumber" | "baseAmount" | "vatAmount" | "purchaseClass" | "userConfirmedVatCredit" | "isFullTaxInvoice"
  >
): string {
  return [
    line.date,
    String(line.vendorTaxId || "").replace(/\D/g, ""),
    String(line.invoiceNumber || "").trim(),
    money(line.baseAmount).toFixed(2),
    money(line.vatAmount).toFixed(2),
    line.purchaseClass,
    line.isFullTaxInvoice ? "1" : "0",
    line.userConfirmedVatCredit ? "1" : "0",
  ].join("|");
}

export function isDuplicateReceipt(
  existing: readonly Pick<StagedReceipt, "vendorTaxId" | "invoiceNumber" | "date" | "id">[],
  candidate: Pick<StagedReceipt, "vendorTaxId" | "invoiceNumber" | "date" | "id">
): boolean {
  const invoiceNumber = String(candidate.invoiceNumber || "").trim();
  const vendorTaxId = String(candidate.vendorTaxId || "").replace(/\D/g, "");
  const date = String(candidate.date || "").trim();
  if (!invoiceNumber || !date) return false;
  return existing.some(
    (row) =>
      row.id !== candidate.id &&
      String(row.invoiceNumber || "").trim() === invoiceNumber &&
      String(row.vendorTaxId || "").replace(/\D/g, "") === vendorTaxId &&
      String(row.date || "").trim() === date
  );
}

export function reviewReceipt(line: StagedReceipt, existing: readonly StagedReceipt[] = []): ReceiptReviewStatus {
  if (line.postedRequestId) return "posted";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(line.date)) return "pending_review";
  if (!String(line.vendorName || "").trim()) return "pending_review";
  if (money(line.totalAmount) <= 0 && money(line.baseAmount) <= 0) return "pending_review";
  if (line.purchaseClass === "unclassified") return "pending_review";
  if (isDuplicateReceipt(existing, line)) return "pending_review";
  if (line.source === "ocr" && !line.approved) return "pending_review";
  return line.approved ? "ready_to_post" : "pending_review";
}

export function planInAppReceiptOcr(): { ok: false; error: string } {
  return {
    ok: false,
    error: "OCR ในแอปยังไม่เปิด — ห้ามเดายอดแล้วลงสมุด ให้วางผลภายนอกเข้าคิวตรวจ",
  };
}

export function planPostStagedReceipt(input: {
  line: StagedReceipt;
  existing: readonly StagedReceipt[];
  requestId: string;
}):
  | {
      ok: true;
      replay: boolean;
      posted: {
        purchaseAmount: number;
        vatCredit: number;
        purchaseClass: PurchaseClass;
        requestId: string;
        fingerprint: string;
      };
    }
  | { ok: false; error: string; kind?: "conflict" | "business" } {
  const requestId = String(input.requestId || "").trim();
  if (!requestId) return { ok: false, error: "ต้องมีคีย์กันซ้ำก่อนลงสมุด", kind: "business" };
  const fingerprint = receiptFingerprint(input.line);
  if (input.line.postedRequestId && input.line.postedRequestId === requestId) {
    if (input.line.postedFingerprint && input.line.postedFingerprint !== fingerprint) {
      return { ok: false, error: "คีย์กันซ้ำเดิมแต่ข้อมูลไม่ตรง — ห้ามลงซ้ำ", kind: "conflict" };
    }
    return {
      ok: true,
      replay: true,
      posted: {
        purchaseAmount: money(input.line.totalAmount || input.line.baseAmount),
        vatCredit: vatCreditAmount(input.line),
        purchaseClass: input.line.purchaseClass,
        requestId,
        fingerprint,
      },
    };
  }
  if (input.line.postedRequestId) return { ok: false, error: "รายการนี้ลงสมุดแล้ว", kind: "business" };
  const other = input.existing.find((row) => row.id !== input.line.id && row.postedRequestId === requestId);
  if (other) {
    return { ok: false, error: "คีย์กันซ้ำนี้ถูกใช้กับใบอื่นแล้ว", kind: "conflict" };
  }
  const status = reviewReceipt(input.line, input.existing);
  if (status === "pending_review") {
    return { ok: false, error: "ข้อมูลไม่ครบหรือยังไม่อนุมัติ — ห้ามเดาแล้วลงสมุด", kind: "business" };
  }
  if (!input.line.approved) return { ok: false, error: "ต้องอนุมัติก่อนลงสมุด", kind: "business" };
  return {
    ok: true,
    replay: false,
    posted: {
      purchaseAmount: money(input.line.totalAmount || input.line.baseAmount),
      vatCredit: vatCreditAmount(input.line),
      purchaseClass: input.line.purchaseClass,
      requestId,
      fingerprint,
    },
  };
}
