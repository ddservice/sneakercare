export function purchaseRpcError(error: { code?: string; message: string }) {
  if (['PGRST202', '42P01', '42883'].includes(error.code ?? '')) {
    return 'ระบบรับเข้ารูปแบบใหม่ยังไม่พร้อม กรุณาให้ผู้ดูแลติดตั้งฐานข้อมูลรุ่น 0047 ก่อน';
  }
  if (['22023','23514','42501','P0001'].includes(error.code ?? '')) return error.message;
  return 'บันทึกหรือโหลดข้อมูลไม่สำเร็จ กรุณาลองอีกครั้งด้วยรายการเดิม';
}
