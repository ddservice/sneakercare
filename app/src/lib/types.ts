// 'staff' คือค่าเก่าของระบบ (deprecated) — ผู้ใช้ใหม่สร้างเป็น 'manager' เสมอ แต่ยังรองรับ 'staff' ไว้
// เผื่อมีบัญชีเก่าที่ยังไม่ได้เปลี่ยน ทั้งสองค่าถือเป็น role ระดับเดียวกัน (ไม่ใช่ admin/co-admin)
export type Role = 'admin' | 'co-admin' | 'manager' | 'staff';

export interface AuthUser {
  userId: string;
  username: string;
  role: Role;
  displayName: string;
  fullName: string;
}

export function canManageStock(role: Role | undefined): boolean {
  return role === 'admin' || role === 'co-admin';
}

export function isAdmin(role: Role | undefined): boolean {
  return role === 'admin';
}
