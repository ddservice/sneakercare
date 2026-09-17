import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_BRANCH_COOKIE = "sc_active_branch";

// layout.tsx (ครอบทุกหน้า) กับหลายหน้าใน (app)/admin ต่างก็ query รายชื่อสาขาที่ active เหมือนกันเป๊ะ
// ห่อด้วย React cache() เพื่อ dedupe ให้เหลือ round-trip เดียวต่อ request เดียวกัน (ไม่ cache ข้าม request —
// ปลอดภัยกับ RLS ที่ผูกกับ session ของผู้ใช้แต่ละคน) คืนแค่ id/name — หน้าที่ต้องใช้ telegram_chat_id
// (เช่น /admin/settings) ต้อง query เองแยกต่างหาก เพราะค่านั้นแก้บ่อยกว่าและต้องสดเสมอหลังบันทึก
export const getActiveBranches = cache(async () => {
  const supabase = await createClient();
  // ⚠️ เพิ่ม tenant_id เข้ามาด้วย (2026-09-17) — super_admin เห็นสาขาข้าม tenant ผ่าน RLS ได้แล้ว
  // แต่สาขาของคนละ tenant อาจตั้งชื่อซ้ำกันได้ (เช่น "SneakerCare" ทั้งคู่) ต้องมี tenant_id ไว้
  // แยกแยะตอนแสดงผลใน BranchPicker ไม่งั้น super_admin เลือกสาขาผิด tenant โดยไม่รู้ตัว
  const { data } = await supabase.from("branches").select("id, name, tenant_id").eq("is_active", true).order("name");
  return data ?? [];
});

// Staff/Co-Admin ใช้สาขาในโปรไฟล์เสมอ Admin/super_admin ใช้คุกกี้ที่เลือก (ว่าง = ดูทุกสาขา)
// ⚠️ [แก้บั๊กจริง 2026-09-17] เดิมเช็คแค่ `role !== "admin"` ⇒ super_admin (ซึ่ง branch_id เป็น
// null เสมอ เพราะไม่ผูกกับ tenant ไหนเลย) ตกไปอยู่กลุ่มเดียวกับ staff/co_admin ที่ "ต้องมี
// branch_id ตายตัว" ทำให้ได้ null กลับไปตลอดโดยไม่มีทางเลือกสาขา/tenant ผ่านคุกกี้ได้เลย
export async function getSelectedBranchId(profile: Profile): Promise<string | null> {
  if (profile.role !== "admin" && profile.role !== "super_admin") {
    return profile.branch_id;
  }

  const cookieStore = await cookies();
  const value = cookieStore.get(ACTIVE_BRANCH_COOKIE)?.value?.trim() ?? "";
  return value || null;
}

export function assertWritableBranch(profile: Profile, branchId: string): string | null {
  if (!branchId) {
    return "กรุณาเลือกสาขาก่อนทำรายการ";
  }
  if (profile.role !== "admin" && profile.role !== "super_admin" && profile.branch_id !== branchId) {
    return "ไม่มีสิทธิ์ทำรายการของสาขานี้";
  }
  return null;
}
