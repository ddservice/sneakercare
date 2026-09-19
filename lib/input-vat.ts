/** ภาษีซื้อจากของที่มีจริง — ยังไม่ใช่สมุดซื้อเต็ม และห้ามเรียกว่าพร้อมยื่น */

import { countsAsPurchaseVat, planPurchaseVat, type PurchaseVatLine } from "./purchase-vat";

export type InputVatLine = {
  date: string;
  vatAmount: number;
  direction?: string;
  source: "wht_certificate" | "purchase_book" | "staged_ocr";
};

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function countsAsInputVat(line: InputVatLine): boolean {
  if (line.source === "staged_ocr") return false;
  if (line.direction && line.direction !== "payable") return false;
  return money(line.vatAmount) > 0;
}

export function planInputVat(lines: readonly InputVatLine[], periodYm: string): {
  vatIn: number;
  lineCount: number;
  completeBook: false;
} {
  const inMonth = lines.filter(
    (line) => countsAsInputVat(line) && String(line.date || "").startsWith(periodYm)
  );
  return {
    vatIn: money(inMonth.reduce((sum, line) => sum + Number(line.vatAmount || 0), 0)),
    lineCount: inMonth.length,
    completeBook: false,
  };
}

export function mergeInputVat(
  whtLines: readonly InputVatLine[],
  purchaseLines: readonly PurchaseVatLine[],
  periodYm: string
): {
  vatIn: number;
  lineCount: number;
  whtVatIn: number;
  purchaseVatIn: number;
  completeBook: false;
} {
  const wht = planInputVat(
    whtLines.filter((line) => line.source === "wht_certificate"),
    periodYm
  );
  const purchase = planPurchaseVat(purchaseLines.filter(countsAsPurchaseVat), periodYm);
  return {
    vatIn: money(wht.vatIn + purchase.vatIn),
    lineCount: wht.lineCount + purchase.lineCount,
    whtVatIn: wht.vatIn,
    purchaseVatIn: purchase.vatIn,
    completeBook: false,
  };
}
