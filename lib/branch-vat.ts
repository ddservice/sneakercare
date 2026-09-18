import "server-only";

import type { Profile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createAdminClient } from "@/lib/supabase/admin";
import { tenantFilter } from "@/lib/tenant";
import { parseBranchVatFlag } from "@/lib/vat";

export type BranchVatContext = {
  branchId: string | null;
  branchName: string | null;
  vatRegistered: boolean;
  branchSelected: boolean;
};

/**
 * VAT เป็นของสาขาที่กำลังทำงาน (คุกกี้หัวเว็บ / branch_id ของพนักงาน)
 * ไม่มีสาขาที่เลือกและมีหลายสาขา → ยังไม่รู้ว่านิติบุคคลไหน จด VAT = false จนกว่าจะเลือก
 * มีสาขาเดียวในกิจการ → ใช้สาขานั้นอัตโนมัติ (SneakerCare ไม่ต้องเลือกทุกครั้ง)
 */
export async function resolveBranchVat(profile: Profile): Promise<BranchVatContext> {
  const supabase = createAdminClient();
  const selectedId = await getSelectedBranchId(profile);

  if (!selectedId) {
    const tenantId = await tenantFilter(profile);
    let query = supabase.from("inv_branches").select("id, name, vat_registered").eq("is_active", true);
    if (tenantId) query = query.eq("tenant_id", tenantId);
    const { data } = await query.limit(2);
    if (data?.length === 1) {
      const only = data[0];
      return {
        branchId: only.id,
        branchName: only.name,
        vatRegistered: parseBranchVatFlag(only.vat_registered),
        branchSelected: true,
      };
    }
    return { branchId: null, branchName: null, vatRegistered: false, branchSelected: false };
  }

  const { data: branch } = await supabase
    .from("inv_branches")
    .select("id, name, vat_registered")
    .eq("id", selectedId)
    .maybeSingle();

  if (!branch) {
    return { branchId: null, branchName: null, vatRegistered: false, branchSelected: false };
  }

  return {
    branchId: branch.id,
    branchName: branch.name,
    vatRegistered: parseBranchVatFlag(branch.vat_registered),
    branchSelected: true,
  };
}
