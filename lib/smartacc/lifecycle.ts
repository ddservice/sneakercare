/** กฎลบ / ยกเลิกเอกสารขาย — เลขที่ที่ออกแล้วไม่คืนตัวนับ และ void ไม่ใช่ใบลดหนี้ */

import { isDraftNumber } from "./issue";

export type DocLifecycleInput = {
  status: string;
  hasBillingRef: boolean;
  docType?: string;
  docNumber?: string;
};

const NEVER_DELETE = new Set(["TAX_INVOICE", "RECEIPT", "CREDIT_NOTE", "DEBIT_NOTE"]);

export function canDeleteDocument(input: DocLifecycleInput): boolean {
  if (input.status !== "DRAFT") return false;
  if (input.hasBillingRef) return false;
  if (input.docType && NEVER_DELETE.has(input.docType)) return false;
  if (input.docNumber && !isDraftNumber(input.docNumber)) return false;
  return true;
}

export function canVoidDocument(input: DocLifecycleInput): boolean {
  if (input.status === "VOID") return false;
  return !canDeleteDocument(input);
}

export function canConvertDocument(status: string): boolean {
  return status !== "VOID" && status !== "CONVERTED";
}

export function deleteBlockedReason(input: DocLifecycleInput): string | null {
  if (canDeleteDocument(input)) return null;
  if (input.status === "VOID") return "เอกสารถูกยกเลิกแล้ว ห้ามลบ เลขที่ต้องเก็บไว้";
  if (input.hasBillingRef) return "เอกสารถูกอ้างในใบวางบิล — ใช้ยกเลิก ไม่ใช่ลบ";
  if (input.docType && NEVER_DELETE.has(input.docType)) {
    return "ใบกำกับ ใบเสร็จ และใบลดหนี้/เพิ่มหนี้ห้ามลบ — ใช้ยกเลิก (เลขที่เก็บไว้)";
  }
  if (input.status === "CONVERTED") return "เอกสารที่แปลงแล้วห้ามลบ — ใช้ยกเลิก";
  if (input.status === "PAID") return "เอกสารที่ชำระแล้วห้ามลบ — ใช้ยกเลิก";
  if (input.docNumber && !isDraftNumber(input.docNumber)) {
    return "เอกสารมีเลขทางการแล้วห้ามลบ — ใช้ยกเลิก";
  }
  return "ห้ามลบเอกสารนี้ — ใช้ยกเลิก";
}

export function voidBlockedReason(input: DocLifecycleInput): string | null {
  if (canVoidDocument(input)) return null;
  if (input.status === "VOID") return "เอกสารถูกยกเลิกแล้ว";
  return "ฉบับร่างที่ยังไม่มีคนอ้างให้ลบได้ ไม่ต้องยกเลิก";
}

/** บัญชีร้านยังอยู่ที่ sc_sales — ยกเลิกเอกสาร SmartAcc ไม่กลับรายการขาย */
export function voidAffectsOfficialBooks(): false {
  return false;
}

export function appendVoidNote(notes: string | null | undefined, reason: string): string {
  const base = String(notes ?? "").trim();
  const line = `[ยกเลิก] ${reason.trim()}`;
  return base ? `${base}\n${line}` : line;
}
