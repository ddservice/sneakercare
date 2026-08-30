"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { data } = await supabase.from("sc_settings" as any).select("key, value");

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
    await supabase.from("sc_settings" as any).upsert(
      { key: item.key, value: item.value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  }

  revalidatePath("/settings");
  revalidatePath("/invoicing");
  revalidatePath("/billing-notes");
  return { success: true };
}
