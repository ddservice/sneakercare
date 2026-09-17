import "server-only";

import { cache } from "react";
import type { Profile } from "@/lib/auth";
import { getActiveBranches } from "@/lib/branch";
import { withId } from "@/lib/db-rows";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * นับรายการสต๊อกต่ำที่ยังไม่ได้ mute — ใช้ร่วมกันที่ badge หัวเว็บกับหน้าภาพรวม
 *
 * ใช้ admin client เพราะต้องนับข้าม RLS ของ view `v_low_stock` (view นั้นเช็คแค่ role
 * `admin` ไม่รู้จัก `super_admin`) แต่กรองสาขา/tenant เองให้ตรงกับคุกกี้ที่เลือกไว้
 *
 * ดึงแค่จำนวน + ขั้นต่ำของแถวที่ยังแจ้งเตือนอยู่ ไม่ดึงทั้งตารางมาที่เซิร์ฟเวอร์แอป
 */
export const countLowStockAlerts = cache(async (
  profile: Profile,
  selectedBranchId: string | null
): Promise<number> => {
  const adminDb = createAdminClient();
  let q = adminDb
    .from("item_stock")
    .select("current_qty, min_stock_level")
    .eq("alert_muted", false);

  if (selectedBranchId) {
    q = q.eq("branch_id", selectedBranchId);
  } else if (profile.role !== "super_admin") {
    const ownBranchIds = withId(await getActiveBranches()).map((b) => b.id);
    q = q.in(
      "branch_id",
      ownBranchIds.length > 0 ? ownBranchIds : ["00000000-0000-0000-0000-000000000000"]
    );
  }

  const { data } = await q;
  return (data ?? []).filter(
    (row) => Number(row.current_qty ?? 0) <= Number(row.min_stock_level ?? 0)
  ).length;
});
