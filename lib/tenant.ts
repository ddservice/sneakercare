import "server-only";
import type { Profile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * tenant_id ที่ต้องใช้กรอง query — null แปลว่า "ไม่ต้องกรอง" (เฉพาะ super_admin ที่ยังไม่ได้
 * เลือกสาขาใดสาขาหนึ่งไว้ที่หัวเว็บเท่านั้น ที่ควรเห็นข้ามทุก tenant) ทุก role อื่นต้องกรองด้วย
 * tenant_id ของตัวเองเสมอ ไม่มีข้อยกเว้น
 *
 * ⚠️ ทำไมต้องมีฟังก์ชันนี้แยกจาก RLS (migration 0031): server action ส่วนใหญ่ในระบบใช้
 * `createAdminClient()` (service_role) ซึ่ง **bypass RLS ทั้งหมดและไม่มี session ผู้ใช้เลย**
 * (`auth.uid()` เป็น null เสมอ) — RLS ป้องกันได้แค่ query ที่ผ่าน session ของผู้ใช้เอง
 * (`lib/supabase/server.ts`) เท่านั้น โค้ดแอปจึงต้องกรอง tenant_id เองตรงๆ ทุกจุดที่ใช้
 * admin client เหมือนที่ `branch_id` ถูกจัดการอยู่แล้วทุกที่ในระบบ (ดู `lib/branch.ts`)
 *
 * ⚠️ [แก้บั๊กจริง 2026-09-17] เดิมฟังก์ชันนี้เป็น sync และคืน `null` ให้ super_admin เสมอไม่ว่าจะ
 * เลือกสาขาไว้หรือไม่ — ผลคือ super_admin เลือกสาขาของ LUXSU ที่หัวเว็บแล้ว หน้า/action ที่ใช้
 * ฟังก์ชันนี้ (เกือบทุกหน้าที่ใช้ service_role) ยังคงเห็น/เขียนข้อมูลแบบไม่กรอง tenant เหมือนเดิม
 * ทุกประการ (เจอครั้งแรกที่ `/dashboard` — ดู CLAUDE.md) ตอนนี้เป็น async แล้ว: ถ้า super_admin
 * เลือกสาขาใดสาขาหนึ่งไว้ (ผ่านคุกกี้ `sc_active_branch`) จะกรองเป็น tenant ของสาขานั้น ถ้ายังไม่
 * เลือก ("ดูทุกสาขา") ยังคงเห็นภาพรวมข้ามทุก tenant เหมือนเดิม (พฤติกรรมเดิมของ badge สต๊อกต่ำ)
 * admin/co-admin/staff ปกติพฤติกรรมไม่เปลี่ยนเลย (ยังคืน `profile.tenant_id` ตรงๆ เหมือนเดิม)
 *
 * ใช้แบบนี้เสมอ:
 *   const tenantId = await tenantFilter(profile);
 *   let query = supabase.from("sc_sales").select("*");
 *   if (tenantId) query = query.eq("tenant_id", tenantId);
 */
export async function tenantFilter(profile: Profile): Promise<string | null> {
  if (profile.role !== "super_admin") return profile.tenant_id;

  const selectedBranchId = await getSelectedBranchId(profile);
  if (!selectedBranchId) return null; // "ดูทุกสาขา" = ยังเห็นภาพรวมข้าม tenant เหมือนเดิม

  const admin = createAdminClient();
  const { data } = await admin.from("branches").select("tenant_id").eq("id", selectedBranchId).maybeSingle();
  return data?.tenant_id ?? null;
}

/**
 * ใช้ก่อน insert/update เสมอเมื่อต้องระบุ tenant_id ตรงๆ ใน payload — throw ถ้าไม่มี tenant
 * ให้ใช้ (เกิดขึ้นได้กรณีเดียว: super_admin ที่ยังไม่ได้เลือกสาขาที่หัวเว็บ จะเขียนข้อมูลลงที่ไหน
 * ต้องระบุมาชัดเจนก่อน ไม่มีค่า default ให้เดาแทน — กันข้อมูลตกไปอยู่ tenant ผิดโดยไม่ตั้งใจ)
 */
export async function requireTenantId(profile: Profile): Promise<string> {
  const t = await tenantFilter(profile);
  if (!t) {
    throw new Error(
      profile.role === "super_admin"
        ? "super_admin ต้องเลือกสาขาที่หัวเว็บก่อน ระบบถึงจะรู้ว่าจะเขียนข้อมูลนี้ให้ tenant ไหน"
        : "บัญชีนี้ไม่มี tenant_id — ติดต่อผู้ดูแลระบบ"
    );
  }
  return t;
}
