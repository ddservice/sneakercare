"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { parseVatRegistered } from "@/lib/vat";

export type ShopProfile = {
  name: string;
  phone: string;
  address: string;
  taxId: string;
  logoUrl: string;
  promptPayId: string;
  /** ชื่อผู้มีอำนาจลงนามบน 50 ทวิ / เอกสารหัก ณ ที่จ่าย */
  signatoryName: string;
  signatureUrl: string;
  stampUrl: string;
  /** จดทะเบียนภาษีมูลค่าเพิ่ม — ไม่มีค่าในฐาน = true เพื่อไม่เปลี่ยนพฤติกรรมกิจการแรก */
  vatRegistered: boolean;
};

export async function fetchShopProfile(): Promise<ShopProfile> {
  // ⚠️ Server Action = endpoint สาธารณะ ใครก็ยิงเข้ามาตรงๆ ได้ ไม่ได้ถูกกันด้วยการ์ดของหน้าเว็บ
  // ข้อมูลนี้ไปอยู่บนหัวเอกสารที่พิมพ์ให้ลูกค้าอยู่แล้วจึงไม่ใช่ความลับ แต่ก็ไม่มีเหตุผลให้คนนอก
  // ที่ไม่ได้ล็อกอินเรียกดูได้ · ทุกที่ที่เรียกฟังก์ชันนี้เป็นหน้าใน (app) ซึ่งล็อกอินแล้วทั้งหมด
  const user = await requireProfile();
  const supabase = createAdminClient();

  // ⚠️ [แก้บั๊กจริง 2026-09-16] เดิม query ทั้งตารางไม่กรอง tenant_id เลย — ใช้ createAdminClient()
  // (service_role) ซึ่ง bypass RLS ทั้งหมด ต่อให้ migration 0031 บังคับ RLS ถูกต้องแล้วก็ไม่มีผล
  // ที่นี่ ⇒ ก่อนแก้ tenant อื่นจะอ่าน/เขียนทับชื่อร้าน/เลขผู้เสียภาษี/PromptPay ของ tenant นี้ได้
  // ตรงๆ ผ่านหน้า /settings ปกติ (ต้องรอ migration 0032 ที่เปลี่ยน sc_settings ให้เป็น
  // composite key (tenant_id, key) ก่อน ไม่งั้นสอง tenant ชนกันที่ key ชื่อเดียวกัน)
  const tenantId = await tenantFilter(user);
  let query = supabase.from("sc_settings").select("key, value");
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { data } = await query;

  const settingsMap: Record<string, string> = {};
  (data || []).forEach((row) => {
    settingsMap[row.key] = row.value || "";
  });

  return {
    name: settingsMap["name"] || "ยังไม่ได้ตั้งค่าชื่อกิจการ — ไปที่ /settings",
    phone: settingsMap["phone"] || "",
    address: settingsMap["address"] || "-",
    taxId: settingsMap["tax_id"] || "-",
    logoUrl: settingsMap["logo_url"] || "",
    promptPayId: settingsMap["promptpay_id"] || settingsMap["tax_id"] || "",
    signatoryName: settingsMap["signatory_name"] || "",
    signatureUrl: settingsMap["signature_url"] || "",
    stampUrl: settingsMap["stamp_url"] || "",
    vatRegistered: parseVatRegistered(settingsMap["vat_registered"]),
  };
}

export async function updateShopProfile(profile: Partial<ShopProfile>) {
  const user = await requireProfile();
  requireAdmin(user);
  const tenantId = await requireTenantId(user);

  const supabase = createAdminClient();

  const updates: Array<{ key: string; value: string }> = [];

  if (profile.name !== undefined) updates.push({ key: "name", value: profile.name });
  if (profile.phone !== undefined) updates.push({ key: "phone", value: profile.phone });
  if (profile.address !== undefined) updates.push({ key: "address", value: profile.address });
  if (profile.taxId !== undefined) updates.push({ key: "tax_id", value: profile.taxId });
  if (profile.logoUrl !== undefined) updates.push({ key: "logo_url", value: profile.logoUrl });
  if (profile.promptPayId !== undefined) updates.push({ key: "promptpay_id", value: profile.promptPayId });
  if (profile.signatoryName !== undefined) updates.push({ key: "signatory_name", value: profile.signatoryName });
  if (profile.signatureUrl !== undefined) updates.push({ key: "signature_url", value: profile.signatureUrl });
  if (profile.stampUrl !== undefined) updates.push({ key: "stamp_url", value: profile.stampUrl });
  if (profile.vatRegistered !== undefined) {
    updates.push({ key: "vat_registered", value: profile.vatRegistered ? "true" : "false" });
  }

  for (const item of updates) {
    // onConflict ต้องระบุ (tenant_id, key) คู่กันเสมอหลัง 0032 — ไม่ใช่ key เดี่ยวเหมือนเดิม
    // ไม่งั้น upsert จะชนกับแถวของ tenant อื่นที่ใช้ key ชื่อเดียวกัน หรือสร้างแถวซ้ำโดยไม่ตั้งใจ
    await supabase.from("sc_settings").upsert(
      { key: item.key, value: item.value, tenant_id: tenantId, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id,key" }
    );
  }

  revalidatePath("/settings");
  revalidatePath("/invoicing");
  revalidatePath("/billing-notes");
  revalidatePath("/tax-filing");
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

// ⚠️ ค่านี้ *ไม่* กรองด้วย tenant_id โดยตั้งใจ — เป็นสวิตช์ระดับแพลตฟอร์ม (แจ้งเตือน backup
// รายวันของ VPS ทั้งเครื่อง ควบคุมโดยผู้ดูแลแพลตฟอร์ม ไม่ใช่ข้อมูลของร้านใดร้านหนึ่ง) migration
// 0032 ย้ายแถวนี้เป็น tenant_id = null ไว้แล้วเพื่อสื่อความหมายนี้ตรงๆ ในฐานข้อมูล
export async function fetchBackupHeartbeatEnabled(): Promise<boolean> {
  await requireProfile();
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("sc_settings")
    .select("value")
    .eq("key", BACKUP_HEARTBEAT_KEY)
    .is("tenant_id", null)
    .maybeSingle();

  // ไม่มีแถว = ยังไม่เคยตั้งค่า → ค่าเริ่มต้นคือ "เปิด" (พฤติกรรมเดิมก่อนมีสวิตช์นี้)
  const value = (data as { value?: string } | null)?.value;
  return value === undefined || value === null || value === "" ? true : value === "true";
}

export async function setBackupHeartbeatEnabled(enabled: boolean) {
  const user = await requireProfile();
  requireAdmin(user);

  const supabase = createAdminClient();
  // onConflict ต้องเป็น "tenant_id,key" คู่กันตั้งแต่ 0032 (key เดี่ยวไม่ใช่ unique constraint
  // อีกต่อไป) และต้องส่ง tenant_id: null ตรงๆ ในนี้ด้วย เพราะเป็นคีย์ระดับแพลตฟอร์ม
  const { error } = await supabase.from("sc_settings").upsert(
    { key: BACKUP_HEARTBEAT_KEY, value: enabled ? "true" : "false", tenant_id: null, updated_at: new Date().toISOString() },
    { onConflict: "tenant_id,key" }
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
