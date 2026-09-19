"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin, requireModuleView } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  planSaveUsageFlags,
  type StockCutPoint,
  type UsageFormula,
} from "@/lib/service-usage";
import {
  readServiceUsageConfig,
  writeServiceUsageConfig,
  type ServiceUsageConfig,
} from "@/lib/service-usage-store";

export type UsageCatalogItem = { id: string; name: string; unit: string };
export type UsageCatalogService = { id: string; name: string };

export async function fetchUsageConfig(): Promise<ServiceUsageConfig> {
  const profile = await requireProfile();
  requireModuleView(profile, "items");
  const tenantId = await tenantFilter(profile);
  if (!tenantId) {
    return { flags: { autoIssueEnabled: false, cutPoint: null }, formulas: [] };
  }
  return readServiceUsageConfig(tenantId);
}

export async function fetchUsageCatalog(): Promise<{
  services: UsageCatalogService[];
  items: UsageCatalogItem[];
}> {
  const profile = await requireProfile();
  requireModuleView(profile, "items");
  const tenantId = await tenantFilter(profile);
  if (!tenantId) return { services: [], items: [] };
  const supabase = createAdminClient();
  const [servicesRes, itemsRes] = await Promise.all([
    supabase.from("services").select("id, name").eq("tenant_id", tenantId).eq("is_active", true).order("name"),
    supabase
      .from("items")
      .select("id, name, base_unit")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
  ]);
  return {
    services: (servicesRes.data ?? []).map((row) => ({ id: row.id, name: row.name })),
    items: (itemsRes.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.base_unit || "หน่วย",
    })),
  };
}

export async function saveUsageCutPoint(
  cutPoint: StockCutPoint | ""
): Promise<{ success: true; config: ServiceUsageConfig } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireAdmin(profile);
  const tenantId = await requireTenantId(profile);
  const current = await readServiceUsageConfig(tenantId);
  const planned = planSaveUsageFlags({
    autoIssueEnabled: false,
    cutPoint: cutPoint === "receive" || cutPoint === "start" || cutPoint === "complete" ? cutPoint : null,
  });
  if (!planned.ok) return { success: false, error: planned.error };
  const next: ServiceUsageConfig = { ...current, flags: planned.flags };
  const writeError = await writeServiceUsageConfig(tenantId, next);
  if (writeError) return { success: false, error: `บันทึกจุดตัดไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: "service_usage",
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "service_usage", cutPoint: planned.flags.cutPoint, autoIssueEnabled: false },
  });
  revalidatePath("/settings");
  return { success: true, config: next };
}

export async function addUsageFormula(input: {
  serviceId: string;
  itemId: string;
  qtyBase: number;
  effectiveFrom: string;
  unit: string;
}): Promise<{ success: true; config: ServiceUsageConfig } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireAdmin(profile);
  const tenantId = await requireTenantId(profile);
  const serviceId = String(input.serviceId || "").trim();
  const itemId = String(input.itemId || "").trim();
  if (!serviceId || !itemId) return { success: false, error: "เลือกบริการและสินค้าก่อนบันทึกสูตร" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.effectiveFrom || "").trim())) {
    return { success: false, error: "วันที่มีผลต้องเป็น YYYY-MM-DD" };
  }
  const qtyBase = Number(input.qtyBase);
  if (!Number.isFinite(qtyBase) || qtyBase <= 0) return { success: false, error: "ปริมาณหน่วยฐานต้องมากกว่า 0" };
  const current = await readServiceUsageConfig(tenantId);
  const version =
    Math.max(
      0,
      ...current.formulas.filter((row) => row.serviceId === serviceId && row.itemId === itemId).map((row) => row.version)
    ) + 1;
  const formula: UsageFormula = {
    serviceId,
    itemId,
    qtyBase,
    version,
    effectiveFrom: input.effectiveFrom,
    approved: false,
    unit: String(input.unit || "").trim() || "หน่วย",
  };
  const next: ServiceUsageConfig = { ...current, formulas: [...current.formulas, formula] };
  const writeError = await writeServiceUsageConfig(tenantId, next);
  if (writeError) return { success: false, error: `บันทึกสูตรไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "CREATE",
    entity: "settings",
    entity_id: `usage:${serviceId}:${itemId}:v${version}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "service_usage", formula, approved: false },
  });
  revalidatePath("/settings");
  return { success: true, config: next };
}

export async function approveUsageFormula(input: {
  serviceId: string;
  itemId: string;
  version: number;
}): Promise<{ success: true; config: ServiceUsageConfig } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireAdmin(profile);
  const tenantId = await requireTenantId(profile);
  const current = await readServiceUsageConfig(tenantId);
  const match = current.formulas.find(
    (row) => row.serviceId === input.serviceId && row.itemId === input.itemId && row.version === input.version
  );
  if (!match) return { success: false, error: "ไม่พบสูตรนี้" };
  const next: ServiceUsageConfig = {
    ...current,
    formulas: current.formulas.map((row) =>
      row.serviceId === input.serviceId && row.itemId === input.itemId && row.version === input.version
        ? { ...row, approved: true }
        : row
    ),
  };
  const writeError = await writeServiceUsageConfig(tenantId, next);
  if (writeError) return { success: false, error: `อนุมัติสูตรไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `usage:${input.serviceId}:${input.itemId}:v${input.version}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "service_usage", approved: true, version: input.version },
  });
  revalidatePath("/settings");
  return { success: true, config: next };
}
