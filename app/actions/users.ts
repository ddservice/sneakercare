"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
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
    branch_id: branchId,
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
  if (id === profile.id && (!isActive || role !== "admin")) {
    return { error: "ไม่สามารถปิดใช้งานหรือลดสิทธิ์บัญชีตัวเองได้" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      role,
      branch_id: branchId,
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

// ═══════════════════════════════════════════════════════════════════════════
// สิ่งที่ต้องมีก่อนเลิกใช้หน้าจัดการผู้ใช้ของระบบเดิม (ขั้นที่ 6 ของ
// docs/sc-opex-refactor-plan.md)
// ═══════════════════════════════════════════════════════════════════════════
//
// ระบบเดิม (Google Apps Script) มี 3 อย่างนี้ที่ระบบใหม่ยังไม่มี:
//   change_password · reset_user_password · delete_user
// ตราบใดที่ยังไม่มี เจ้าของก็ต้องเปิดหน้าเดิมค้างไว้ = เลิกใช้ `sc_opex` ไม่ได้สักที
//
// ⚠️ `delete_month` ของระบบเดิม (ลบข้อมูลทั้งเดือนรวดเดียว) **จงใจไม่ทำตาม** —
// เป็นการลบข้อมูลเงินหลายสิบแถวด้วยการกดปุ่มเดียวโดยไม่มีทางกู้คืน ระบบใหม่ลบทีละรายการ
// พร้อมเก็บค่าเดิมไว้ใน `sc_audit_logs` ทุกครั้ง ซึ่งปลอดภัยกว่ามาก

/**
 * ผู้ใช้เปลี่ยนรหัสผ่านของตัวเอง
 *
 * ⚠️ ต้องยืนยันรหัสผ่านเดิมก่อนเสมอ — ไม่งั้นใครที่ยืมเครื่องที่เปิดค้างไว้จะยึดบัญชีได้ทันที
 * ตรวจด้วยการ `signInWithPassword` ซ้ำ ซึ่งผ่าน rate limit ของ Supabase เองอีกชั้น
 */
export async function changeOwnPassword(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const profile = await requireProfile();

  const current = String(formData.get("current_password") ?? "");
  const next = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm_password") ?? "");

  if (!current || !next || !confirm) return { error: "กรุณากรอกให้ครบทุกช่อง" };
  if (next !== confirm) return { error: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" };
  if (next.length < 12) return { error: "รหัสผ่านใหม่ต้องยาวอย่างน้อย 12 ตัวอักษร" };
  if (next === current) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม" };

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const email = userData?.user?.email;
  if (!email) return { error: "ไม่พบอีเมลของบัญชีนี้ กรุณาเข้าสู่ระบบใหม่" };

  // ยืนยันรหัสผ่านเดิม
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
  if (verifyError) return { error: "รหัสผ่านเดิมไม่ถูกต้อง" };

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) return { error: `เปลี่ยนรหัสผ่านไม่สำเร็จ: ${error.message}` };

  console.info(`[users] ${profile.username} เปลี่ยนรหัสผ่านของตัวเองสำเร็จ`);
  return { success: true };
}

/**
 * แอดมินส่งอีเมลตั้งรหัสผ่านใหม่ให้ผู้ใช้
 *
 * ⚠️ จงใจ **ไม่** ให้แอดมินตั้งรหัสผ่านให้คนอื่นตรงๆ (ซึ่งระบบเดิมทำได้) — วิธีนั้นแปลว่า
 * แอดมินรู้รหัสผ่านของพนักงาน แล้วเข้าระบบในนามคนอื่นได้โดยที่ audit log บันทึกเป็นชื่อคนนั้น
 * การส่งลิงก์ให้เจ้าตัวตั้งเองปลอดภัยกว่าและไม่มีใครรู้รหัสผ่านของใคร
 */
export async function sendPasswordReset(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "ไม่พบผู้ใช้ที่ต้องการรีเซ็ต" };

  const admin = createAdminClient();
  const { data: target, error: getError } = await admin.auth.admin.getUserById(id);
  if (getError || !target?.user?.email) {
    return { error: `ไม่พบบัญชีนี้: ${getError?.message ?? "ไม่มีอีเมล"}` };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || undefined;
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(target.user.email, {
    redirectTo: siteUrl ? `${siteUrl}/login` : undefined,
  });
  if (error) return { error: `ส่งอีเมลไม่สำเร็จ: ${error.message}` };

  await logAudit({
    action: "UPDATE",
    entity: "user",
    entity_id: id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { action: "ส่งอีเมลตั้งรหัสผ่านใหม่", target_email: target.user.email },
  });

  revalidatePath("/admin/users");
  return { success: true };
}

/**
 * แอดมินลบผู้ใช้
 *
 * ⚠️ **ต้องเช็ค ledger ก่อนเสมอ** — `inv_audit_logs.performed_by` และ
 * `inv_stock_transactions.performed_by` มี FK มาที่บัญชีผู้ใช้ ถ้าบัญชีนั้นเคยทำรายการไว้
 * การลบทิ้งเท่ากับไปแก้ไข audit ย้อนหลัง ซึ่งผิดกฎข้อ 1 และ 2 ใน CLAUDE.md
 * (เคยเจอจริงกับบัญชี `rlsverify35...` ที่ Postgres บล็อกไว้ให้เอง)
 * กรณีนั้นให้ "ปิดใช้งาน" แทนการลบ ซึ่งกันเข้าระบบได้ผลเท่ากันโดยไม่แตะประวัติ
 */
export async function deleteUser(_prev: UserActionState, formData: FormData): Promise<UserActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "ไม่พบผู้ใช้ที่ต้องการลบ" };
  if (id === profile.id) return { error: "ลบบัญชีตัวเองไม่ได้" };

  const admin = createAdminClient();

  const [{ count: auditCount }, { count: txnCount }] = await Promise.all([
    admin.from("inv_audit_logs").select("*", { count: "exact", head: true }).eq("performed_by", id),
    admin.from("inv_stock_transactions").select("*", { count: "exact", head: true }).eq("performed_by", id),
  ]);
  if ((auditCount ?? 0) > 0 || (txnCount ?? 0) > 0) {
    return {
      error:
        `ลบไม่ได้เพราะบัญชีนี้เคยทำรายการไว้ในระบบคลังสินค้าแล้ว ` +
        `(บันทึกตรวจสอบ ${auditCount ?? 0} รายการ · ความเคลื่อนไหวสต๊อก ${txnCount ?? 0} รายการ) ` +
        `— การลบเท่ากับแก้ไขประวัติย้อนหลัง ให้ใช้ "ปิดใช้งาน" แทน ซึ่งกันเข้าระบบได้เหมือนกัน`,
    };
  }

  const { data: doomed } = await admin
    .from("profiles")
    .select("username, display_name, role, branch_id")
    .eq("id", id)
    .maybeSingle();

  const { error: profileError } = await admin.from("profiles").delete().eq("id", id);
  if (profileError) return { error: `ลบโปรไฟล์ไม่สำเร็จ: ${profileError.message}` };

  const { error: authError } = await admin.auth.admin.deleteUser(id);

  await logAudit({
    action: "DELETE",
    entity: "user",
    entity_id: id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { ...(doomed ?? {}), auth_deleted: !authError, auth_error: authError?.message ?? null },
  });

  revalidatePath("/admin/users");
  return authError
    ? { error: `ลบโปรไฟล์แล้วแต่ลบบัญชีเข้าระบบไม่สำเร็จ: ${authError.message}` }
    : { success: true };
}
