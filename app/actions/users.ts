"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/supabase/database.types";

export type UserActionState = { error?: string; success?: boolean } | undefined;

const ROLES: UserRole[] = ["admin", "co_admin", "staff"];

function parseRole(value: string): UserRole | null {
  return ROLES.includes(value as UserRole) ? (value as UserRole) : null;
}

export async function inviteUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const displayName = String(formData.get("display_name") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim() || email.split("@")[0];
  const role = parseRole(String(formData.get("role") ?? ""));
  const branchIdRaw = String(formData.get("branch_id") ?? "").trim();
  const branchId = !branchIdRaw || branchIdRaw === "none" ? null : branchIdRaw;

  if (!email || !displayName || !role) {
    return { error: "กรุณากรอกอีเมล ชื่อที่แสดง และบทบาท" };
  }
  if (role !== "admin" && !branchId) {
    return { error: "Co-Admin และ Staff ต้องผูกกับสาขา" };
  }

  const admin = createAdminClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || undefined;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: siteUrl ? `${siteUrl}/login` : undefined,
    data: { display_name: displayName, username, role, branch_id: branchId },
  });

  if (error || !data.user) {
    return { error: `เชิญไม่สำเร็จ: ${error?.message ?? "ไม่ได้รับ user id"}` };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    username,
    display_name: displayName,
    role,
    branch_id: role === "admin" ? branchId : branchId,
    is_active: true,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: `สร้างโปรไฟล์ไม่สำเร็จ: ${profileError.message}` };
  }

  revalidatePath("/admin/users");
  return { success: true };
}

export async function updateUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const role = parseRole(String(formData.get("role") ?? ""));
  const branchIdRaw = String(formData.get("branch_id") ?? "").trim();
  const branchId = !branchIdRaw || branchIdRaw === "none" ? null : branchIdRaw;
  const isActive = String(formData.get("is_active") ?? "") === "true";

  if (!id || !displayName || !role) {
    return { error: "กรุณากรอกข้อมูลให้ครบ" };
  }
  if (role !== "admin" && !branchId) {
    return { error: "Co-Admin และ Staff ต้องผูกกับสาขา" };
  }
  if (id === profile.id && !isActive) {
    return { error: "ไม่สามารถปิดใช้งานบัญชีตัวเองได้" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      role,
      branch_id: role === "admin" ? branchId : branchId,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/admin/users");
  return { success: true };
}
