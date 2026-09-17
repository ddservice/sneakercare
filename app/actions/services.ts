"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import { errorMessage } from "@/lib/errors";

export type ShopService = {
  id: string;
  name: string;
  category: string;
  code: string;
  basePrice: number;
  isActive: boolean;
};

function slugCode(name: string, category: string) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `${category}-${base || Date.now().toString(36)}`;
}

export async function fetchShopServices(): Promise<ShopService[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "pos");
  const supabase = createAdminClient();

  let query = supabase
    .from("services")
    .select("id, name, category, code, base_price, is_active")
    .order("category")
    .order("name");
  const tenantId = await tenantFilter(profile);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category || "package",
    code: s.code,
    basePrice: Number(s.base_price || 0),
    isActive: s.is_active !== false,
  }));
}

export async function createShopService(input: {
  name: string;
  category: string;
  basePrice: number;
  code?: string;
}) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  let tenantId: string;
  try {
    tenantId = await requireTenantId(profile);
  } catch (err) {
    return { success: false as const, error: errorMessage(err, "เลือกสาขาของกิจการก่อน จึงจะเพิ่มบริการได้") };
  }

  const name = input.name.trim();
  if (!name) return { success: false as const, error: "กรุณาระบุชื่อบริการ" };
  const category = (input.category.trim() || "package").slice(0, 40);
  const code = (input.code?.trim() || slugCode(name, category)).slice(0, 60);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      name,
      category,
      code,
      base_price: Number(input.basePrice) || 0,
      is_active: true,
      tenant_id: tenantId,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { success: false as const, error: error?.message ?? "บันทึกบริการไม่สำเร็จ" };
  }

  await logAudit({
    action: "CREATE",
    entity: "settings",
    entity_id: data.id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { kind: "service", name, category, tenant_id: tenantId },
  });
  revalidatePath("/pos");
  revalidatePath("/pos/daily-entry");
  revalidatePath("/invoicing");
  return { success: true as const, id: data.id };
}

export async function updateShopService(input: {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  isActive: boolean;
}) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  const tenantId = await requireTenantId(profile);
  const name = input.name.trim();
  if (!name) return { success: false as const, error: "กรุณาระบุชื่อบริการ" };

  const supabase = createAdminClient();
  const { error, data } = await supabase
    .from("services")
    .update({
      name,
      category: input.category.trim() || "package",
      base_price: Number(input.basePrice) || 0,
      is_active: input.isActive,
    })
    .eq("id", input.id)
    .eq("tenant_id", tenantId)
    .select("id");
  if (error) return { success: false as const, error: error.message };
  if (!data?.length) return { success: false as const, error: "ไม่พบบริการของกิจการนี้" };

  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: input.id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { kind: "service", name },
  });
  revalidatePath("/pos");
  revalidatePath("/pos/daily-entry");
  revalidatePath("/invoicing");
  return { success: true as const };
}
