import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { canSeeCost, canWrite } from "@/lib/permissions";
import { InventoryClient, type InventoryRow } from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function InventoryHubPage() {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);
  const supabase = await createClient();
  const isCostVisible = canSeeCost(profile.role);
  const canEdit = canWrite(profile.role, "inventory");

  // Fetch all items joined with item_stock
  const { data: rawItems } = await supabase
    .from("items")
    .select("*, item_stock(*)")
    .order("name");

  const stockItems: InventoryRow[] = (rawItems || []).map((item: any) => {
    const stockRow = Array.isArray(item.item_stock) ? item.item_stock[0] : item.item_stock;
    const currentQty = Number(stockRow?.current_qty ?? 0);
    const minStock = Number(stockRow?.min_stock_level ?? item.default_min_stock_level ?? 1);
    const unitCost = Number(stockRow?.avg_unit_cost ?? 0);
    return {
      id: item.id,
      item_id: item.id,
      name: item.name,
      item_type: item.item_type || "inventory",
      category: item.category || "ทั่วไป",
      base_unit: item.base_unit || "ชิ้น",
      purchase_unit: item.purchase_unit || item.base_unit || "ชิ้น",
      current_qty: currentQty,
      min_stock_level: minStock,
      avg_unit_cost: unitCost,
      total_value: currentQty * unitCost,
      is_low_stock: currentQty <= minStock,
      is_active: item.is_active ?? true,
      alert_muted: stockRow?.alert_muted ?? false,
    };
  });

  return (
    <InventoryClient
      initialItems={stockItems}
      isCostVisible={isCostVisible}
      canEdit={canEdit}
    />
  );
}
