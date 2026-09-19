"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { planMarkPp30Filed, planPreparePp30, type Pp30FilingRecord } from "@/lib/pp30-filing";
import { readPp30Filings, upsertFiling, writePp30Filings } from "@/lib/pp30-filing-store";

export async function fetchPp30Filings(): Promise<Pp30FilingRecord[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "tax-filing");
  const tenantId = await tenantFilter(profile);
  if (!tenantId) return [];
  return readPp30Filings(tenantId);
}

export async function preparePp30Filing(input: {
  periodYm: string;
  reviewerName: string;
  paper: Pp30FilingRecord["paper"];
}): Promise<{ success: true; filings: Pp30FilingRecord[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const planned = planPreparePp30({
    ...input,
    preparedAt: new Date().toISOString(),
  });
  if (!planned.ok) return { success: false, error: planned.error };
  const current = await readPp30Filings(tenantId);
  const next = upsertFiling(current, planned.record);
  const writeError = await writePp30Filings(tenantId, next);
  if (writeError) return { success: false, error: `บันทึกการเตรียมไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `pp30:${input.periodYm}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "pp30_filings", status: "prepared", periodYm: input.periodYm },
  });
  revalidatePath("/tax-filing");
  return { success: true, filings: next };
}

export async function recordPp30Filed(input: {
  periodYm: string;
  filerName: string;
  filedAt: string;
  evidenceRef: string;
  evidenceNote?: string;
  userConfirmedExternalFiling: boolean;
}): Promise<{ success: true; filings: Pp30FilingRecord[] } | { success: false; error: string }> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "tax-filing");
  const tenantId = await requireTenantId(profile);
  const current = await readPp30Filings(tenantId);
  const existing = current.find((row) => row.periodYm === input.periodYm);
  if (!existing) return { success: false, error: "ยังไม่มีรายการที่เตรียมข้อมูลแล้วสำหรับงวดนี้" };
  const planned = planMarkPp30Filed({
    current: existing,
    filerName: input.filerName,
    filedAt: input.filedAt,
    evidenceRef: input.evidenceRef,
    evidenceNote: input.evidenceNote,
    userConfirmedExternalFiling: input.userConfirmedExternalFiling,
  });
  if (!planned.ok) return { success: false, error: planned.error };
  const next = upsertFiling(current, planned.record);
  const writeError = await writePp30Filings(tenantId, next);
  if (writeError) return { success: false, error: `บันทึกการยื่นไม่สำเร็จ: ${writeError}` };
  await logAudit({
    action: "UPDATE",
    entity: "settings",
    entity_id: `pp30:${input.periodYm}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { setting: "pp30_filings", status: "filed", periodYm: input.periodYm, evidenceRef: input.evidenceRef },
  });
  revalidatePath("/tax-filing");
  return { success: true, filings: next };
}
