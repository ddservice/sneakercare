/** กระดาษทำงานภาษี — ห้ามเรียกว่าพร้อมยื่นจากผลลัพธ์ชุดนี้ */

import { isDraftNumber } from "./smartacc/issue";

export type TaxReconDoc = {
  docType: string;
  status: string;
  docNumber: string;
  issueDate: string;
  grandTotal: number;
  vatAmount: number;
};

export type TaxReconInput = {
  periodYm: string;
  booksRevenue: number;
  booksCashIn: number;
  documents: TaxReconDoc[];
  expenseVatIn?: number;
  inputVatComplete?: boolean;
  whtPayable?: number;
  periodClosed?: boolean;
};

function money(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function countsTowardOutputVat(doc: TaxReconDoc): boolean {
  if (doc.status === "VOID") return false;
  if (isDraftNumber(doc.docNumber)) return false;
  return doc.docType === "INVOICE" || doc.docType === "TAX_INVOICE" || doc.docType === "RECEIPT";
}

export function countsAsCreditNote(doc: TaxReconDoc): boolean {
  return doc.docType === "CREDIT_NOTE" && doc.status !== "VOID" && !isDraftNumber(doc.docNumber);
}

export function countsAsDebitNote(doc: TaxReconDoc): boolean {
  return doc.docType === "DEBIT_NOTE" && doc.status !== "VOID" && !isDraftNumber(doc.docNumber);
}

export function inPeriod(date: string, periodYm: string): boolean {
  return String(date || "").startsWith(periodYm);
}

export function planTaxRecon(input: TaxReconInput): {
  periodYm: string;
  booksRevenue: number;
  booksCashIn: number;
  documentSales: number;
  creditNotes: number;
  debitNotes: number;
  documentNetSales: number;
  salesGap: number;
  vatOut: number;
  vatIn: number;
  vatNet: number;
  whtPayable: number;
  readyToFile: false;
  blockers: string[];
} {
  const periodDocs = input.documents.filter((d) => inPeriod(d.issueDate, input.periodYm));
  const documentSales = money(
    periodDocs.filter(countsTowardOutputVat).reduce((sum, d) => sum + Number(d.grandTotal || 0), 0)
  );
  const creditNotes = money(
    periodDocs.filter(countsAsCreditNote).reduce((sum, d) => sum + Number(d.grandTotal || 0), 0)
  );
  const debitNotes = money(
    periodDocs.filter(countsAsDebitNote).reduce((sum, d) => sum + Number(d.grandTotal || 0), 0)
  );
  const documentNetSales = money(documentSales - creditNotes + debitNotes);
  const booksRevenue = money(input.booksRevenue);
  const booksCashIn = money(input.booksCashIn);
  const salesGap = money(booksRevenue - documentNetSales);
  const vatOut = money(
    periodDocs.filter(countsTowardOutputVat).reduce((sum, d) => sum + Number(d.vatAmount || 0), 0)
  );
  const vatIn = money(input.expenseVatIn ?? 0);
  const vatNet = money(vatOut - vatIn);
  const whtPayable = money(input.whtPayable ?? 0);

  const blockers = [
    "ภ.พ.30 ในแอปเป็นข้อความอ้างอิง ไม่ใช่แบบยื่น",
    "e-Tax ในแอปเป็นตัวอย่าง ยังไม่ส่งจริง",
  ];
  if (!input.periodClosed) {
    blockers.push("ยังไม่ปิดงวด");
  }
  if (Math.abs(salesGap) >= 0.01) {
    blockers.push("ยอดขายบัญชีร้านกับเอกสารไม่ตรงกัน");
  }
  if (!input.inputVatComplete) {
    blockers.push("ภาษีซื้อยังไม่ใช่สมุดซื้อเต็ม (ใบหัก ณ ที่จ่าย + ใบเสร็จที่กรอกเอง — ไม่นับ OCR และยังไม่ครบทุกใบซื้อ)");
  }

  return {
    periodYm: input.periodYm,
    booksRevenue,
    booksCashIn,
    documentSales,
    creditNotes,
    debitNotes,
    documentNetSales,
    salesGap,
    vatOut,
    vatIn,
    vatNet,
    whtPayable,
    readyToFile: false,
    blockers,
  };
}
