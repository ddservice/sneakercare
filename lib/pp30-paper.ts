/**
 * กระดาษทำงาน ภ.พ.30 ตามช่องในแบบกรมสรรพากร
 * แหล่ง: https://rd.go.th/fileadmin/tax_pdf/vat/pp30_300160.pdf (พิมพ์ ม.ค. 2560) ตรวจ 2026-09-19
 * ยื่นจริงกรอกที่ e-Filing — โมดูลนี้ห้ามตั้ง readyToFile เป็น true
 *
 * นับสมุดขายจากใบกำกับภาษี + ใบเพิ่มหนี้ − ใบลดหนี้ (ไม่นับ VOID / เลข DRAFT- / แปลงแล้ว)
 * ยังไม่แยกยอดขาย 0% กับยกเว้นตาม ม.81 · ยังไม่เก็บภาษีชำระเกินยกมา · ไม่คำนวณเงินเพิ่ม/เบี้ยปรับ
 */

import { moneyNumber } from "./money";
import { isDraftNumber } from "./smartacc/issue";

export type Pp30Doc = {
  docType: string;
  status: string;
  docNumber: string;
  issueDate: string;
  subtotal: number;
  vatAmount: number;
  grandTotal?: number;
};

export type Pp30PaperInput = {
  periodYm: string;
  documents: readonly Pp30Doc[];
  purchaseBase: number;
  purchaseVat: number;
  inputVatComplete?: boolean;
  periodClosed?: boolean;
  /** ช่อง 10 — ยังไม่มีสมุดยกมาในระบบ จึงค่าเริ่มต้น 0 */
  excessBroughtForward?: number;
};

function money(n: number): number {
  return moneyNumber(Number(n) || 0);
}

function issued(doc: Pp30Doc): boolean {
  if (doc.status === "VOID" || doc.status === "CONVERTED") return false;
  if (isDraftNumber(doc.docNumber)) return false;
  return true;
}

export function countsTowardPp30TaxInvoice(doc: Pp30Doc): boolean {
  return issued(doc) && doc.docType === "TAX_INVOICE";
}

export function countsTowardPp30CreditNote(doc: Pp30Doc): boolean {
  return issued(doc) && doc.docType === "CREDIT_NOTE";
}

export function countsTowardPp30DebitNote(doc: Pp30Doc): boolean {
  return issued(doc) && doc.docType === "DEBIT_NOTE";
}

export function pp30DocBase(doc: Pp30Doc): number {
  const sub = money(doc.subtotal);
  if (sub > 0) return sub;
  return money(Number(doc.grandTotal || 0) - Number(doc.vatAmount || 0));
}

function signedSales(docs: readonly Pp30Doc[]): { base: number; vat: number } {
  let base = 0;
  let vat = 0;
  for (const doc of docs) {
    if (countsTowardPp30TaxInvoice(doc) || countsTowardPp30DebitNote(doc)) {
      base += pp30DocBase(doc);
      vat += money(doc.vatAmount);
    } else if (countsTowardPp30CreditNote(doc)) {
      base -= pp30DocBase(doc);
      vat -= money(doc.vatAmount);
    }
  }
  return { base: money(base), vat: money(vat) };
}

export function planPp30Paper(input: Pp30PaperInput): {
  periodYm: string;
  line1Sales: number;
  line2ZeroRated: number;
  line3Exempt: number;
  line4TaxableSales: number;
  line5OutputVat: number;
  line6PurchaseBase: number;
  line7InputVat: number;
  line8VatPayable: number;
  line9VatExcess: number;
  line10ExcessBroughtForward: number;
  line11NetPayable: number;
  line12NetExcess: number;
  readyToFile: false;
  blockers: string[];
} {
  const periodDocs = input.documents.filter((d) => String(d.issueDate || "").startsWith(input.periodYm));
  const sales = signedSales(periodDocs);
  const line2ZeroRated = 0;
  const line3Exempt = 0;
  const line1Sales = money(sales.base + line2ZeroRated + line3Exempt);
  const line4TaxableSales = money(line1Sales - line2ZeroRated - line3Exempt);
  const line5OutputVat = sales.vat;
  const line6PurchaseBase = money(input.purchaseBase);
  const line7InputVat = money(input.purchaseVat);
  const vatDiff = money(line5OutputVat - line7InputVat);
  const line8VatPayable = vatDiff > 0 ? vatDiff : 0;
  const line9VatExcess = vatDiff < 0 ? money(-vatDiff) : 0;
  const line10ExcessBroughtForward = money(input.excessBroughtForward ?? 0);
  let line11NetPayable = 0;
  let line12NetExcess = 0;
  if (line8VatPayable > 0) {
    const afterCarry = money(line8VatPayable - line10ExcessBroughtForward);
    if (afterCarry > 0) line11NetPayable = afterCarry;
    else line12NetExcess = money(-afterCarry);
  } else {
    line12NetExcess = money(line9VatExcess + line10ExcessBroughtForward);
  }

  const blockers = [
    "ภ.พ.30 ในแอปเป็นกระดาษทำงาน ไม่ใช่แบบยื่น — กรอกที่ e-Filing",
    "e-Tax ในแอปเป็นตัวอย่าง ยังไม่ส่งจริง",
    "ยังไม่แยกยอดขายอัตรา 0% กับยอดขายยกเว้นตามมาตรา 81",
    "ยังไม่มีภาษีชำระเกินยกมา (ช่อง 10) และไม่คำนวณเงินเพิ่ม/เบี้ยปรับ (ช่อง 13–16)",
  ];
  if (!input.periodClosed) blockers.push("ยังไม่ปิดงวด");
  if (!input.inputVatComplete) {
    blockers.push("ภาษีซื้อยังไม่ใช่สมุดซื้อเต็ม (ใบหัก ณ ที่จ่าย + ใบเสร็จที่กรอกเอง — ไม่นับ OCR และยังไม่ครบทุกใบซื้อ)");
  }

  return {
    periodYm: input.periodYm,
    line1Sales,
    line2ZeroRated,
    line3Exempt,
    line4TaxableSales,
    line5OutputVat,
    line6PurchaseBase,
    line7InputVat,
    line8VatPayable,
    line9VatExcess,
    line10ExcessBroughtForward,
    line11NetPayable,
    line12NetExcess,
    readyToFile: false,
    blockers,
  };
}
