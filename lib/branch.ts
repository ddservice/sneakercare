import "server-only";
import { cookies } from "next/headers";
import type { Profile } from "@/lib/auth";

export const ACTIVE_BRANCH_COOKIE = "sc_active_branch";

// Staff/Co-Admin ใช้สาขาในโปรไฟล์เสมอ Admin ใช้คุกกี้ที่เลือก (ว่าง = ดูทุกสาขา)
export async function getSelectedBranchId(profile: Profile): Promise<string | null> {
  if (profile.role !== "admin") {
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
  if (profile.role !== "admin" && profile.branch_id !== branchId) {
    return "ไม่มีสิทธิ์ทำรายการของสาขานี้";
  }
  return null;
}
