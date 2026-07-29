import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useBranchId } from './branch';
import type { Item } from './items';

const invalidateStock = (qc: ReturnType<typeof useQueryClient>, branchId: string | null) => {
  qc.invalidateQueries({ queryKey: ['inv_item_stock', branchId] });
};

export function useSaveStockIn() {
  const qc = useQueryClient();
  const branchId = useBranchId();
  return useMutation({
    mutationFn: async ({
      item,
      purchaseQty,
      totalCost,
      supplierId,
      txnDate,
      note,
      performedBy,
    }: {
      item: Item;
      purchaseQty: number;
      totalCost: number;
      supplierId: string | null;
      txnDate: string;
      note: string;
      performedBy: string;
    }) => {
      const baseQty = purchaseQty * item.purchase_unit_qty;
      const unitCost = baseQty > 0 ? totalCost / baseQty : 0;

      const { error } = await supabase.from('inv_stock_transactions').insert({
        item_id: item.id,
        branch_id: branchId,
        txn_type: 'stock_in',
        transaction_date: txnDate,
        quantity_delta: baseQty,
        unit_cost_snapshot: unitCost,
        supplier_id: supplierId,
        reference_type: 'purchase',
        reference_note: note || null,
        performed_by: performedBy,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateStock(qc, branchId),
  });
}

export function useSaveStockOut() {
  const qc = useQueryClient();
  const branchId = useBranchId();
  return useMutation({
    mutationFn: async ({
      item,
      qty,
      note,
      performedBy,
    }: {
      item: Item;
      qty: number;
      note: string;
      performedBy: string;
    }) => {
      const { error } = await supabase.from('inv_stock_transactions').insert({
        item_id: item.id,
        branch_id: branchId,
        txn_type: 'stock_out',
        quantity_delta: -Math.abs(qty),
        reference_type: 'service_order',
        reference_note: note || null,
        performed_by: performedBy,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateStock(qc, branchId),
  });
}

export function useSaveAdjustment(canManageStock: boolean) {
  const qc = useQueryClient();
  const branchId = useBranchId();
  return useMutation({
    mutationFn: async ({
      itemId,
      direction,
      qty,
      reason,
      performedBy,
    }: {
      itemId: string;
      direction: 'increase' | 'decrease';
      qty: number;
      reason: string;
      performedBy: string;
    }) => {
      const status = canManageStock ? 'approved' : 'pending_approval';
      const { error } = await supabase.from('inv_stock_transactions').insert({
        item_id: itemId,
        branch_id: branchId,
        txn_type: direction === 'increase' ? 'adjustment_increase' : 'adjustment_decrease',
        status,
        quantity_delta: direction === 'increase' ? Math.abs(qty) : -Math.abs(qty),
        reason,
        performed_by: performedBy,
      });
      if (error) throw error;
      return status;
    },
    onSuccess: () => invalidateStock(qc, branchId),
  });
}
