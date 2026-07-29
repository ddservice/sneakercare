import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { toBaseQty, unitCostFromTotal, type Item } from './items';

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

/** ธุรกรรมย้อนกลับของรายการซื้อเข้าเดิม — ห้าม UPDATE/DELETE แถวเดิมเด็ดขาด (กฎ append-only ledger ข้อ 2
 *  ใน CLAUDE.md) ทั้งแก้ไขและลบใช้รูปแบบเดียวกันนี้ ต่างกันแค่ข้อความเหตุผล/หมายเหตุ และว่ามีรายการทดแทนตามมาหรือไม่ */
async function insertReversalTxn({
  original,
  item,
  canManageStock,
  reasonText,
  noteText,
  performedBy,
}: {
  original: PurchaseHistoryRow;
  item: Item;
  canManageStock: boolean;
  reasonText: string;
  noteText: string;
  performedBy: string;
}): Promise<ReductionStatus> {
  const status = canManageStock ? 'approved' : 'pending_approval';
  const { error } = await supabase.from('inv_stock_transactions').insert({
    item_id: item.id,
    branch_id: original.branch_id,
    txn_type: 'adjustment_decrease',
    status,
    // ต้องใช้วันที่ของรายการเดิมเสมอ ไม่ใช่ปล่อยให้ default เป็นวันนี้ (current_date) — ไม่งั้นการแก้ไข/ลบ
    // รายการซื้อของเดือนก่อนๆ จะไปเบียดยอดต้นทุนวัสดุของเดือนปัจจุบันแทนที่จะหักออกจากเดือนที่ซื้อจริง
    // (เจอบั๊กนี้จริงกับ "น้ำยาขจัดคราบสีฟ้า" ที่ซื้อจริง ก.พ. 2569 แต่ตอนแก้ไขไปโผล่เป็นยอด ก.ค. แทน)
    transaction_date: original.transaction_date,
    quantity_delta: -Number(original.quantity_delta),
    reason: reasonText,
    supplier_id: original.supplier_id || null,
    reference_type: 'correction',
    corrects_txn_id: original.id,
    reference_note: noteText,
    performed_by: performedBy,
  });
  if (error) throw new Error(error.message);
  return status;
}

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
      newDate,
      reason,
      canManageStock,
      performedBy,
    }: {
      original: PurchaseHistoryRow;
      item: Item;
      newPurchaseQty: number;
      newTotal: number;
      newSupplierId: string | null;
      newDate: string;
      reason: string;
      canManageStock: boolean;
      performedBy: string;
    }) => {
      const newBaseQty = toBaseQty(item, newPurchaseQty);
      const newUnitCost = unitCostFromTotal(newBaseQty, newTotal);

      try {
        await insertReversalTxn({
          original, item, canManageStock, performedBy,
          reasonText: `แก้ไขรายการซื้อเข้าที่กรอกผิด: ${reason}`,
          noteText: `ยกเลิกรายการที่กรอกผิด — เหตุผล: ${reason}`,
        });
      } catch (revErr) {
        throw new Error('แก้ไขไม่สำเร็จ (ขั้นยกเลิกรายการเดิม): ' + (revErr instanceof Error ? revErr.message : String(revErr)));
      }

      const { error: newErr } = await supabase.from('inv_stock_transactions').insert({
        item_id: item.id,
        branch_id: original.branch_id,
        txn_type: 'stock_in',
        transaction_date: newDate,
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
      try {
        await insertReversalTxn({
          original, item, canManageStock, performedBy,
          reasonText: `ลบรายการซื้อเข้าที่กรอกซ้ำ/ผิด: ${reason}`,
          noteText: `ลบรายการที่กรอกซ้ำ/ผิด — เหตุผล: ${reason}`,
        });
      } catch (err) {
        throw new Error('ลบไม่สำเร็จ: ' + (err instanceof Error ? err.message : String(err)));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['inv_item_stock'] });
    },
  });
}
