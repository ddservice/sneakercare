"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireAdmin, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { planClosePeriod, planReopenPeriod } from "@/lib/period-close";
import { readClosedPeriods, writeClosedPeriods } from "@/lib/period-close-store";

export async function fetchClosedPeriods(): Promise<string[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  const tenantId = await tenantFilter(profile);
  if (!tenantId) return [];
  return readClosedPeriods(tenantId);
}

export async function closePeriod(
  periodYm: string
): Promise<{ success: true; closed: string[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireAdmin(profile);
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const current = await readClosedPeriods(tenantId);
  const planned = planClosePeriod(current, periodYm);
  if (!planned.ok) return { success: false, error: planned.error };
  const writeError = await writeClosedPeriods(tenantId, planned.next);
  if (writeError) return { success: false, error: `ปิดงวดไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `closed_periods:${periodYm}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "closed_periods", closed: periodYm, periods: planned.next },
  });
  revalidatePath("/tax-filing");
  revalidatePath("/", "layout");
  return { success: true, closed: planned.next };
}

export async function reopenPeriod(
  periodYm: string
): Promise<{ success: true; closed: string[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireAdmin(profile);
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const current = await readClosedPeriods(tenantId);
  const planned = planReopenPeriod(current, periodYm);
  if (!planned.ok) return { success: false, error: planned.error };
  const writeError = await writeClosedPeriods(tenantId, planned.next);
  if (writeError) return { success: false, error: `เปิดงวดไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `closed_periods:${periodYm}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "closed_periods", reopened: periodYm, periods: planned.next },
  });
  revalidatePath("/tax-filing");
  revalidatePath("/", "layout");
  return { success: true, closed: planned.next };
}
