/** ร่างไม่กินเลขทางการ — ออกเลขตอนออกจริงในก้าวเดียว */

/** ใบลดหนี้/เพิ่มหนี้ยังไม่เชื่อมยอดขาย ลูกหนี้ ภาษี — ห้ามออกเลขทางการ */
export const CORRECTION_OFFICIAL_ISSUE_ALLOWED = false;

export function isCorrectionDocType(docType: string | null | undefined): boolean {
  return docType === "CREDIT_NOTE" || docType === "DEBIT_NOTE";
}

export function consumesOfficialNumberOnCreate(docType: string): boolean {
  if (isCorrectionDocType(docType) && !CORRECTION_OFFICIAL_ISSUE_ALLOWED) return false;
  return docType === "TAX_INVOICE" || docType === "RECEIPT";
}

export function isDraftNumber(docNumber: string | null | undefined): boolean {
  return String(docNumber ?? "").startsWith("DRAFT-");
}

export function planDraftNumber(issueDate: string, entropy: string): string {
  const ymd = String(issueDate).replace(/-/g, "").slice(0, 8) || "00000000";
  const suffix = String(entropy).replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase();
  return `DRAFT-${ymd}-${suffix || "TEMP"}`;
}

export function correctionOfficialIssueBlockedReason(docType?: string | null): string | null {
  if (!isCorrectionDocType(docType) || CORRECTION_OFFICIAL_ISSUE_ALLOWED) return null;
  return "ยังไม่เชื่อมผลต่อยอดขาย ลูกหนี้ และภาษี — ใบลดหนี้/เพิ่มหนี้เป็นร่าง ออกเลขทางการไม่ได้";
}

export function canIssueOfficialNumber(status: string, docNumber: string, docType?: string): boolean {
  if (correctionOfficialIssueBlockedReason(docType)) return false;
  if (status === "VOID") return false;
  return isDraftNumber(docNumber);
}

export function issueBlockedReason(status: string, docNumber: string, docType?: string): string | null {
  const correction = correctionOfficialIssueBlockedReason(docType);
  if (correction) return correction;
  if (canIssueOfficialNumber(status, docNumber, docType)) return null;
  if (status === "VOID") return "เอกสารถูกยกเลิกแล้ว ออกเลขไม่ได้";
  return "เอกสารนี้มีเลขทางการแล้ว";
}
