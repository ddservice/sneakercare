"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";

export type ShopProfile = {
  name: string;
  phone: string;
  address: string;
  taxId: string;
  logoUrl: string;
  promptPayId: string;
};

export async function fetchShopProfile(): Promise<ShopProfile> {
  const supabase = createAdminClient();

  const { data } = await supabase.from("sc_settings").select("key, value");

  const settingsMap: Record<string, string> = {};
  (data || []).forEach((row: any) => {
    settingsMap[row.key] = row.value || "";
  });

  return {
    name: settingsMap["name"] || "บริษัท รวยรับทรัพย์168 จำกัด",
    phone: settingsMap["phone"] || "052010120",
    address: settingsMap["address"] || "552/4 ถ.เชียงใหม่-ลำพูน ต.หนองหอย อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50000",
    taxId: settingsMap["tax_id"] || "0505568021002",
    logoUrl: settingsMap["logo_url"] || "https://mdlxogfkpwejnqpzhmoy.supabase.co/storage/v1/object/public/branding/LOGO.jpeg",
    promptPayId: settingsMap["promptpay_id"] || settingsMap["tax_id"] || "0505568021002",
  };
}

export async function updateShopProfile(profile: Partial<ShopProfile>) {
  const user = await requireProfile();
  requireAdmin(user);

  const supabase = createAdminClient();

  const updates: Array<{ key: string; value: string }> = [];

  if (profile.name !== undefined) updates.push({ key: "name", value: profile.name });
  if (profile.phone !== undefined) updates.push({ key: "phone", value: profile.phone });
  if (profile.address !== undefined) updates.push({ key: "address", value: profile.address });
  if (profile.taxId !== undefined) updates.push({ key: "tax_id", value: profile.taxId });
  if (profile.logoUrl !== undefined) updates.push({ key: "logo_url", value: profile.logoUrl });
  if (profile.promptPayId !== undefined) updates.push({ key: "promptpay_id", value: profile.promptPayId });

  for (const item of updates) {
    await supabase.from("sc_settings").upsert(
      { key: item.key, value: item.value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  }

  revalidatePath("/settings");
  revalidatePath("/invoicing");
  revalidatePath("/billing-notes");
  return { success: true };
}

// ────────────────────────────────────────────────────────────────────────────
//  สวิตช์แจ้งเตือน "สำรองข้อมูลสำเร็จ" ที่ยิงเข้า Telegram กลุ่มร้านตอนตี 3 / ตี 4
//
//  ⚠️ อ่านก่อนแก้: HANDOFF.md กฎข้อ 3 ห้าม "ถอด" การแจ้งเตือนตอนสำเร็จออกจาก
//  scripts/backup-db-to-r2.sh เพราะระบบใช้หลัก "เงียบ = ผิดปกติ" — ถ้าไม่มีข้อความมาเลย
//  แปลว่า cron ตาย ตรงนี้ไม่ได้ถอดออก แต่ทำให้ "ปิดได้จากหน้าเว็บ" ตามที่เจ้าของร้องขอ
//  (2026-09-06: ข้อความปลุกพนักงานตอนกลางดึก) โดยยังคงหลักการไว้ด้วยข้อจำกัด 2 ข้อ:
//
//    1. ปิดได้เฉพาะข้อความ "สำเร็จ" เท่านั้น — ข้อความ "ล้มเหลว" ยิงเสมอ ปิดไม่ได้ทุกกรณี
//       (สคริปต์ไม่เช็ค flag นี้ตอน notify_failure เลย ดู scripts/backup-db-to-r2.sh)
//    2. ปิดแล้วยังเขียนลง /var/log/rrs-backup.log บน VPS เหมือนเดิมทุกคืน ตรวจย้อนหลังได้
//
//  ผลข้างเคียงที่ต้องยอมรับเมื่อปิด: ถ้า cron ตายทั้งตัว (เช่นเซิร์ฟเวอร์ไม่บูต crontab หาย)
//  จะไม่มีสัญญาณอะไรเตือนเลย เพราะ "ไม่มีข้อความ" กลายเป็นสภาพปกติไปแล้ว — ทางแก้ระยะยาว
//  คือใช้ dead-man switch ภายนอก (เช่น healthchecks.io) ที่เตือนเมื่อ heartbeat ขาด
// ────────────────────────────────────────────────────────────────────────────

// ไม่ export ค่าคงที่: ไฟล์ "use server" export ได้เฉพาะ async function เท่านั้น
const BACKUP_HEARTBEAT_KEY = "backup_success_notify";

export async function fetchBackupHeartbeatEnabled(): Promise<boolean> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings" as any)
    .select("value")
    .eq("key", BACKUP_HEARTBEAT_KEY)
    .maybeSingle();

  // ไม่มีแถว = ยังไม่เคยตั้งค่า → ค่าเริ่มต้นคือ "เปิด" (พฤติกรรมเดิมก่อนมีสวิตช์นี้)
  const value = (data as { value?: string } | null)?.value;
  return value === undefined || value === null || value === "" ? true : value === "true";
}

export async function setBackupHeartbeatEnabled(enabled: boolean) {
  const user = await requireProfile();
  requireAdmin(user);

  const supabase = createAdminClient();
  const { error } = await supabase.from("sc_settings").upsert(
    { key: BACKUP_HEARTBEAT_KEY, value: enabled ? "true" : "false", updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );

  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` };

  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: BACKUP_HEARTBEAT_KEY,
    actor_id: user.id,
    actor_name: user.display_name,
    detail: {
      setting: BACKUP_HEARTBEAT_KEY,
      value: enabled ? "true" : "false",
      note: enabled
        ? "เปิดแจ้งเตือน Telegram ตอนสำรองข้อมูลสำเร็จ"
        : "ปิดแจ้งเตือน Telegram ตอนสำรองข้อมูลสำเร็จ (ข้อความล้มเหลวยังส่งอยู่)",
    },
  });

  revalidatePath("/settings");
  return { success: true };
}
