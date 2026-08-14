"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, requireAdmin } from "@/lib/auth";

export type SettingsActionState = { error?: string; success?: boolean } | undefined;

// เขียน Telegram Bot Token ได้ทางเดียวผ่าน RPC นี้เท่านั้น (fn_set_integration_secret) — ห้ามสร้าง
// action อื่นที่ SELECT ค่าจริงจาก integration_secrets กลับมาแสดง แม้แต่ให้ Admin ดู
// ดู docs/architecture.md §2.1 และ CLAUDE.md กฎข้อ 9
export async function setTelegramToken(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const token = String(formData.get("token") ?? "").trim();
  if (!token) {
    return { error: "กรุณากรอก Bot Token" };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_set_integration_secret", {
    p_key: "telegram_bot_token",
    p_value: token,
  });

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/admin/settings");
  return { success: true };
}

export async function updateBranchChatId(
  _prev: SettingsActionState,
  formData: FormData
): Promise<SettingsActionState> {
  const profile = await requireProfile();
  requireAdmin(profile);

  const branchId = String(formData.get("branch_id") ?? "");
  const chatId = String(formData.get("telegram_chat_id") ?? "").trim();
  if (!branchId) {
    return { error: "ไม่พบสาขา" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({ telegram_chat_id: chatId || null })
    .eq("id", branchId);

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/admin/settings");
  return { success: true };
}
