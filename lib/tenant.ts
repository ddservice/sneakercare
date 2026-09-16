import "server-only";
import type { Profile } from "@/lib/auth";

/**
 * tenant_id ที่ต้องใช้กรอง query — null แปลว่า "ไม่ต้องกรอง" (เฉพาะ super_admin เท่านั้น
 * ที่ควรเห็นข้ามทุก tenant) ทุก role อื่นต้องกรองด้วย tenant_id ของตัวเองเสมอ ไม่มีข้อยกเว้น
 *
 * ⚠️ ทำไมต้องมีฟังก์ชันนี้แยกจาก RLS (migration 0031): server action ส่วนใหญ่ในระบบใช้
 * `createAdminClient()` (service_role) ซึ่ง **bypass RLS ทั้งหมดและไม่มี session ผู้ใช้เลย**
 * (`auth.uid()` เป็น null เสมอ) — RLS ป้องกันได้แค่ query ที่ผ่าน session ของผู้ใช้เอง
 * (`lib/supabase/server.ts`) เท่านั้น โค้ดแอปจึงต้องกรอง tenant_id เองตรงๆ ทุกจุดที่ใช้
 * admin client เหมือนที่ `branch_id` ถูกจัดการอยู่แล้วทุกที่ในระบบ (ดู `lib/branch.ts`)
 *
 * ใช้แบบนี้เสมอ:
 *   const tenantId = tenantFilter(profile);
 *   let query = supabase.from("sc_sales").select("*");
 *   if (tenantId) query = query.eq("tenant_id", tenantId);
 */
export function tenantFilter(profile: Profile): string | null {
  return profile.role === "super_admin" ? null : profile.tenant_id;
}

/**
 * ใช้ก่อน insert/update เสมอเมื่อต้องระบุ tenant_id ตรงๆ ใน payload — throw ถ้าไม่มี tenant
 * ให้ใช้ (เกิดขึ้นได้กรณีเดียว: super_admin ที่ไม่มี tenant ของตัวเอง จะเขียนข้อมูลลงที่ไหน
 * ต้องระบุมาชัดเจนแยกต่างหาก ไม่มีค่า default ให้เดาแทน — กันข้อมูลตกไปอยู่ tenant ผิดโดยไม่ตั้งใจ)
 */
export function requireTenantId(profile: Profile): string {
  const t = tenantFilter(profile);
  if (!t) {
    throw new Error(
      profile.role === "super_admin"
        ? "บัญชี super_admin ไม่มี tenant ของตัวเอง ต้องระบุ tenant ที่จะเขียนข้อมูลให้ชัดเจนก่อน"
        : "บัญชีนี้ไม่มี tenant_id — ติดต่อผู้ดูแลระบบ"
    );
  }
  return t;
}
