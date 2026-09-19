/** สมุดภาษีซื้อจากใบกำกับที่กรอกเอง — ไม่นับ OCR จำลอง และห้ามเรียกว่าสมุดซื้อเต็ม */

export const PURCHASE_VAT_KEY = "purchase_vat_lines";

export type PurchaseVatSource = "manual_invoice" | "staged_ocr" | "expense_guess";

export type PurchaseVatLine = {
  id: string;
  date: string;
  vatAmount: number;
  baseAmount: number;
  vendorName: string;
  vendorTaxId: string;
  invoiceNumber: string;
  source: PurchaseVatSource;
  voided?: boolean;
};

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function isPurchaseDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value).trim());
}

export function countsAsPurchaseVat(line: PurchaseVatLine): boolean {
  if (line.voided) return false;
  if (line.source !== "manual_invoice") return false;
  if (!isPurchaseDate(line.date)) return false;
  return money(line.vatAmount) > 0;
}

export function parsePurchaseVatLines(raw: string | null | undefined): PurchaseVatLine[] {
  if (!raw || !String(raw).trim()) return [];
  try {
    const parsed = JSON.parse(String(raw)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const source = row.source === "staged_ocr" || row.source === "expense_guess" ? row.source : "manual_invoice";
      return [
        {
          id: String(row.id || ""),
          date: String(row.date || ""),
          vatAmount: money(Number(row.vatAmount || 0)),
          baseAmount: money(Number(row.baseAmount || 0)),
          vendorName: String(row.vendorName || "").trim(),
          vendorTaxId: String(row.vendorTaxId || "").replace(/[^0-9]/g, ""),
          invoiceNumber: String(row.invoiceNumber || "").trim(),
          source,
          voided: row.voided === true,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function serializePurchaseVatLines(lines: readonly PurchaseVatLine[]): string {
  return JSON.stringify(lines);
}

export function planPurchaseVat(
  lines: readonly PurchaseVatLine[],
  periodYm: string
): { vatIn: number; lineCount: number; completeBook: false } {
  const inMonth = lines.filter((line) => countsAsPurchaseVat(line) && line.date.startsWith(periodYm));
  return {
    vatIn: money(inMonth.reduce((sum, line) => sum + Number(line.vatAmount || 0), 0)),
    lineCount: inMonth.length,
    completeBook: false,
  };
}

export function planAddPurchaseVat(
  current: readonly PurchaseVatLine[],
  input: {
    date: string;
    vatAmount: number;
    baseAmount?: number;
    vendorName: string;
    vendorTaxId?: string;
    invoiceNumber?: string;
    id?: string;
  }
): { ok: true; next: PurchaseVatLine[] } | { ok: false; error: string } {
  const date = String(input.date || "").trim();
  if (!isPurchaseDate(date)) return { ok: false, error: "ระบุวันที่ใบเสร็จเป็น YYYY-MM-DD" };
  const vatAmount = money(input.vatAmount);
  if (vatAmount <= 0) return { ok: false, error: "ยอด VAT ต้องมากกว่า 0" };
  const vendorName = String(input.vendorName || "").trim();
  if (!vendorName) return { ok: false, error: "กรุณาระบุชื่อผู้ขาย" };
  const vendorTaxId = String(input.vendorTaxId || "").replace(/[^0-9]/g, "");
  if (vendorTaxId && vendorTaxId.length !== 13) {
    return { ok: false, error: "เลขผู้เสียภาษีผู้ขายต้องเป็น 13 หลัก ถ้าจะกรอก" };
  }
  if (input.id && current.some((row) => row.id === input.id && !row.voided)) {
    return { ok: true, next: [...current] };
  }
  const line: PurchaseVatLine = {
    id: input.id || `pv-${date}-${Math.random().toString(36).slice(2, 10)}`,
    date,
    vatAmount,
    baseAmount: money(input.baseAmount ?? 0),
    vendorName,
    vendorTaxId,
    invoiceNumber: String(input.invoiceNumber || "").trim(),
    source: "manual_invoice",
  };
  return { ok: true, next: [...current, line] };
}

export function planRemovePurchaseVat(
  current: readonly PurchaseVatLine[],
  id: string
): { ok: true; next: PurchaseVatLine[] } | { ok: false; error: string } {
  if (!current.some((line) => line.id === id)) return { ok: false, error: "ไม่พบบรรทัดนี้ในสมุดซื้อ" };
  return { ok: true, next: current.filter((line) => line.id !== id) };
}
