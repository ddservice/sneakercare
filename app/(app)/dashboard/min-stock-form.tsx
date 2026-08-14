"use client";

import { useActionState } from "react";
import { setMinStockLevel, type StockActionState } from "@/app/actions/stock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function MinStockForm({
  itemId,
  branchId,
  currentMin,
  unit,
}: {
  itemId: string;
  branchId: string;
  currentMin: number;
  unit: string;
}) {
  const [state, action, pending] = useActionState<StockActionState, FormData>(setMinStockLevel, undefined);

  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="branch_id" value={branchId} />
      <Input
        name="min_stock_level"
        type="number"
        min="0"
        step="0.01"
        defaultValue={currentMin}
        className="h-8 w-24 text-right"
        aria-label={`จุดสั่งซื้อขั้นต่ำ (${unit})`}
        required
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending ? "..." : "บันทึก"}
      </Button>
      {state?.error && <span className="text-xs text-destructive">{state.error}</span>}
    </form>
  );
}
