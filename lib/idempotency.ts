/** กันกดบันทึกซ้ำ — คีย์ต่อครั้งที่ผู้ใช้ส่งฟอร์ม ไม่ใช่ต่อวันหรือต่อบิล */

export function newRequestId(): string {
  return crypto.randomUUID();
}

export function isIdempotentReplay(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const message = String(error.message ?? "");
  const unique = code === "23505" || /duplicate key/i.test(message);
  return unique && /client_request|tenant_request_uidx/i.test(message);
}
