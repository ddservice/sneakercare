"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { assertPeriodOpen } from "@/lib/period-close-store";
import { planAddPurchaseVat, planRemovePurchaseVat, type PurchaseVatLine } from "@/lib/purchase-vat";
import { readPurchaseVatLines, writePurchaseVatLines } from "@/lib/purchase-vat-store";

export async function fetchPurchaseVatLines(): Promise<PurchaseVatLine[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  const tenantId = await tenantFilter(profile);
  if (!tenantId) return [];
  return readPurchaseVatLines(tenantId);
}

export async function addPurchaseVatLine(input: {
  date: string;
  vatAmount: number;
  baseAmount?: number;
  vendorName: string;
  vendorTaxId?: string;
  invoiceNumber?: string;
}): Promise<{ success: true; lines: PurchaseVatLine[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const closedErr = await assertPeriodOpen(tenantId, input.date);
  if (closedErr) return { success: false, error: closedErr };
  const current = await readPurchaseVatLines(tenantId);
  const planned = planAddPurchaseVat(current, { ...input, id: crypto.randomUUID() });
  if (!planned.ok) return { success: false, error: planned.error };
  const writeError = await writePurchaseVatLines(tenantId, planned.next);
  if (writeError) return { success: false, error: `บันทึกสมุดซื้อไม่สำเร็จ: ${writeError}` };
  const added = planned.next[planned.next.length - 1];
  await logAudit({
    action: "CREATE",
    entity: "settings",
    entity_id: added?.id || "purchase_vat",
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "purchase_vat_lines", line: added },
  });
  revalidatePath("/tax-filing");
  return { success: true, lines: planned.next };
}

export async function deletePurchaseVatLine(
  id: string
): Promise<{ success: true; lines: PurchaseVatLine[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const current = await readPurchaseVatLines(tenantId);
  const doomed = current.find((line) => line.id === id);
  if (doomed) {
    const closedErr = await assertPeriodOpen(tenantId, doomed.date);
    if (closedErr) return { success: false, error: closedErr };
  }
  const planned = planRemovePurchaseVat(current, id);
  if (!planned.ok) return { success: false, error: planned.error };
  const writeError = await writePurchaseVatLines(tenantId, planned.next);
  if (writeError) return { success: false, error: `ลบสมุดซื้อไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "DELETE",
    entity: "settings",
    entity_id: id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "purchase_vat_lines", removed: doomed ?? { id } },
  });
  revalidatePath("/tax-filing");
  return { success: true, lines: planned.next };
}
