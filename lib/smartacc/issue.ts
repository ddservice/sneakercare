/** ร่างไม่กินเลขทางการ — ออกเลขตอนออกจริงในก้าวเดียว */

export function consumesOfficialNumberOnCreate(docType: string): boolean {
  return (
    docType === "TAX_INVOICE" ||
    docType === "RECEIPT" ||
    docType === "CREDIT_NOTE" ||
    docType === "DEBIT_NOTE"
  );
}

export function isDraftNumber(docNumber: string | null | undefined): boolean {
  return String(docNumber ?? "").startsWith("DRAFT-");
}

export function planDraftNumber(issueDate: string, entropy: string): string {
  const ymd = String(issueDate).replace(/-/g, "").slice(0, 8) || "00000000";
  const suffix = String(entropy).replace(/[^A-Za-z0-9]/g, "").slice(0, 12).toUpperCase();
  return `DRAFT-${ymd}-${suffix || "TEMP"}`;
}

export function canIssueOfficialNumber(status: string, docNumber: string): boolean {
  if (status === "VOID") return false;
  return isDraftNumber(docNumber);
}

export function issueBlockedReason(status: string, docNumber: string): string | null {
  if (canIssueOfficialNumber(status, docNumber)) return null;
  if (status === "VOID") return "เอกสารถูกยกเลิกแล้ว ออกเลขไม่ได้";
  return "เอกสารนี้มีเลขทางการแล้ว";
}
