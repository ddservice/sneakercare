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

  // ⚠️ (แก้บั๊ก 2026-09-06) ชื่อฟังก์ชันจริงบนฐานข้อมูลคือ `inv_fn_set_integration_secret`
  // ไม่ใช่ `fn_set_integration_secret` — ฝั่ง "อ่านสถานะ" มี alias ไร้ prefix ให้ (
  // `fn_integration_secret_status`) แต่ฝั่ง "เขียน" ไม่เคยมี alias เลย ปุ่มบันทึก Bot Token
  // จึงพังมาตลอดด้วย error "Could not find the function public.fn_set_integration_secret
  // (p_key, p_value) in the schema cache" — เพิ่งเจอตอนต้องเปลี่ยน token ด่วนเพราะของเดิมหลุด
  //
  // เรียกชื่อจริงก่อน แล้ว fallback ไปชื่อไร้ prefix เผื่อฐานข้อมูลอื่น (local/CI ที่สร้างจาก
  // migrations ล้วนๆ จะมีเฉพาะชื่อไร้ prefix เพราะ alias inv_* เกิดจาก
  // scripts/apply-aliases-and-unified-schema.sql ที่รันบน production เท่านั้น)
  const args = { p_key: "telegram_bot_token", p_value: token };
  // cast เพราะ lib/supabase/database.types.ts ถูก generate ไว้ตั้งแต่ก่อนมี alias inv_*
  // จึงยังไม่รู้จักชื่อฟังก์ชันที่มี prefix (ดูงานค้าง "generate types ของ sc_*/inv_*")
  const rpc = supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    params: Record<string, string>
  ) => Promise<{ error: { message: string } | null }>;

  let { error } = await rpc("inv_fn_set_integration_secret", args);

  if (error && /schema cache|does not exist|Could not find the function/i.test(error.message)) {
    console.warn("[settings] ไม่พบ inv_fn_set_integration_secret ลองชื่อไร้ prefix ต่อ:", error.message);
    ({ error } = await rpc("fn_set_integration_secret", args));
  }

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
