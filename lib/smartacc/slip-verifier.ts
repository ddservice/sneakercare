import "server-only";

export type SlipVerificationResult = {
  isValid: boolean;
  transRef?: string;
  amount?: number;
  sendingBank?: string;
  receivingBank?: string;
  transDate?: string;
  error?: string;
};

/** No provider has been connected. Never manufacture a VERIFIED payment. */
export async function verifyBankSlip(_qrPayload: string, _targetDocumentId?: string): Promise<SlipVerificationResult> {
  return { isValid: false, error: "ตรวจสลิปอัตโนมัติยังไม่เปิดใช้งาน กรุณาตรวจหลักฐานกับบัญชีธนาคารและบันทึกรับเงินจริง ระบบยังไม่ได้ยืนยันสลิปหรือเปลี่ยนสถานะชำระเงิน" };
}
