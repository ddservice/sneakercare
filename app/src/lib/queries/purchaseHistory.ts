import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Item } from './items';

export interface PurchaseHistoryRow {
  id: string;
  branch_id: string;
  item_id: string;
  supplier_id: string | null;
  txn_type: string;
  reference_type: string | null;
  reference_note: string | null;
  quantity_delta: number;
  unit_cost_snapshot: number;
  total_cost: number | null;
  transaction_date: string | null;
  created_at: string;
  performed_by: string;
  status: string;
  corrects_txn_id: string | null;
}

export type ReductionStatus = 'pending_approval' | 'approved' | 'rejected' | undefined;

const KEY = ['inv_purchase_history'];

export function usePurchaseHistory() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inv_stock_transactions')
        .select('*')
        .in('txn_type', ['stock_in', 'adjustment_decrease'])
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;

      const all = (data || []) as PurchaseHistoryRow[];
      const rows = all.filter((d) => d.txn_type === 'stock_in');

      const reductionsByTarget = new Map<string, string>();
      all.forEach((d) => {
        if (d.corrects_txn_id && d.txn_type === 'adjustment_decrease') {
          reductionsByTarget.set(d.corrects_txn_id, d.status);
        }
      });

      return { rows, reductionsByTarget };
    },
  });
}

export function reductionStatusFor(reductionsByTarget: Map<string, string>, id: string): ReductionStatus {
  const raw = reductionsByTarget.get(id);
  return raw === 'rejected' ? undefined : (raw as ReductionStatus);
}

export function useCorrectPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      original,
      item,
      newPurchaseQty,
      newTotal,
      newSupplierId,
      reason,
      canManageStock,
      performedBy,
    }: {
      original: PurchaseHistoryRow;
      item: Item;
      newPurchaseQty: number;
      newTotal: number;
      newSupplierId: string | null;
      reason: string;
      canManageStock: boolean;
      performedBy: string;
    }) => {
      const newBaseQty = newPurchaseQty * item.purchase_unit_qty;
      const newUnitCost = newBaseQty > 0 ? newTotal / newBaseQty : 0;

      const revStatus = canManageStock ? 'approved' : 'pending_approval';
      const { error: revErr } = await supabase.from('inv_stock_transactions').insert({
        item_id: item.id,
        branch_id: original.branch_id,
        txn_type: 'adjustment_decrease',
        status: revStatus,
        quantity_delta: -Number(original.quantity_delta),
        reason: `แก้ไขรายการซื้อเข้าที่กรอกผิด: ${reason}`,
        supplier_id: original.supplier_id || null,
        reference_type: 'correction',
        corrects_txn_id: original.id,
        reference_note: `ยกเลิกรายการที่กรอกผิด — เหตุผล: ${reason}`,
        performed_by: performedBy,
      });
      if (revErr) throw new Error('แก้ไขไม่สำเร็จ (ขั้นยกเลิกรายการเดิม): ' + revErr.message);

      const { error: newErr } = await supabase.from('inv_stock_transactions').insert({
        item_id: item.id,
        branch_id: original.branch_id,
        txn_type: 'stock_in',
        quantity_delta: newBaseQty,
        unit_cost_snapshot: newUnitCost,
        supplier_id: newSupplierId,
        reference_type: 'correction',
        corrects_txn_id: original.id,
        reference_note: `แก้ไขจากรายการเดิม — เหตุผล: ${reason}`,
        performed_by: performedBy,
      });
      if (newErr) {
        throw new Error(
          'ยกเลิกรายการเดิมสำเร็จแล้ว แต่บันทึกรายการที่แก้ไขไม่สำเร็จ: ' + newErr.message +
          ' (กรุณาแจ้ง Admin ตรวจสอบยอดคงเหลือ)',
        );
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['inv_item_stock'] });
    },
  });
}

export function useVoidPurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      original,
      item,
      reason,
      canManageStock,
      performedBy,
    }: {
      original: PurchaseHistoryRow;
      item: Item;
      reason: string;
      canManageStock: boolean;
      performedBy: string;
    }) => {
      const status = canManageStock ? 'approved' : 'pending_approval';
      const { error } = await supabase.from('inv_stock_transactions').insert({
        item_id: item.id,
        branch_id: original.branch_id,
        txn_type: 'adjustment_decrease',
        status,
        quantity_delta: -Number(original.quantity_delta),
        reason: `ลบรายการซื้อเข้าที่กรอกซ้ำ/ผิด: ${reason}`,
        supplier_id: original.supplier_id || null,
        reference_type: 'correction',
        corrects_txn_id: original.id,
        reference_note: `ลบรายการที่กรอกซ้ำ/ผิด — เหตุผล: ${reason}`,
        performed_by: performedBy,
      });
      if (error) throw new Error('ลบไม่สำเร็จ: ' + error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['inv_item_stock'] });
    },
  });
}
