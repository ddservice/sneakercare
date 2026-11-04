"use server";

import { requireProfile, requireAdmin, requireModuleView } from "@/lib/auth";
import { requireTenantId } from "@/lib/tenant";
import { financeRpc } from "@/lib/finance-rpc";
import { logAudit } from "@/lib/audit";

export async function fetchAccountantPacket(month: string) {
  const profile = await requireProfile();
  requireModuleView(profile, "reports");
  requireAdmin(profile);
  const tenantId = await requireTenantId(profile);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("กรุณาเลือกเดือน");
  const packet = await financeRpc("rrs_accountant_packet", { p_actor: profile.id, p_tenant: tenantId, p_month: month });
  await logAudit({ action: "EXPORT", entity: "document", entity_id: month, actor_id: profile.id, actor_name: profile.display_name, tenant_id: tenantId, detail: { month, export_type: "accountant_packet" } });
  return packet;
}
