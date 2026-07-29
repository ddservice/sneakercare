import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { syncLegacyStock } from '../legacySync';
import { useBranchId } from './branch';

export interface Item {
  id: string;
  sku: string | null;
  name: string;
  item_type: 'consumable' | 'inventory';
  category: string;
  base_unit: string;
  purchase_unit: string;
  purchase_unit_qty: number;
  default_min_stock_level: number;
  is_active: boolean;
}

export interface ItemStock {
  item_id: string;
  name: string;
  item_type: string;
  category: string;
  base_unit: string;
  purchase_unit: string;
  purchase_unit_qty: number;
  current_qty: number;
  avg_unit_cost: number;
  min_stock_level: number;
}

export interface ItemInput {
  name: string;
  item_type: 'consumable' | 'inventory';
  category: string;
  base_unit: string;
  purchase_unit: string;
  purchase_unit_qty: number;
  default_min_stock_level: number;
}

export interface InitialStockInput {
  qty: number;
  total: number;
  supplierId: string | null;
  date: string;
  performedBy: string;
}

const ITEMS_KEY = ['inv_items'];
const STOCK_KEY = (branchId: string | null) => ['inv_item_stock', branchId];

export function useItems() {
  return useQuery({
    queryKey: ITEMS_KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('inv_items').select('*').order('name');
      if (error) throw error;
      return data as Item[];
    },
  });
}

export function useItemStock() {
  const branchId = useBranchId();
  const itemsQuery = useItems();

  return useQuery({
    queryKey: STOCK_KEY(branchId),
    enabled: !!branchId && !!itemsQuery.data,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inv_item_stock')
        .select('*')
        .eq('branch_id', branchId);
      if (error) throw error;
      const byItem = new Map(data.map((s) => [s.item_id, s]));
      return (itemsQuery.data || [])
        .filter((i) => i.is_active)
        .map((i): ItemStock => {
          const s = byItem.get(i.id);
          return {
            item_id: i.id,
            name: i.name,
            item_type: i.item_type,
            category: i.category,
            base_unit: i.base_unit,
            purchase_unit: i.purchase_unit,
            purchase_unit_qty: i.purchase_unit_qty,
            current_qty: Number(s?.current_qty || 0),
            avg_unit_cost: Number(s?.avg_unit_cost || 0),
            min_stock_level: Number(s?.min_stock_level ?? i.default_min_stock_level ?? 0),
          };
        });
    },
  });
}

export function useSaveItem() {
  const qc = useQueryClient();
  const branchId = useBranchId();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
      initialStock,
      performedBy,
    }: {
      id: string | null;
      payload: ItemInput;
      initialStock: InitialStockInput | null;
      performedBy: string;
    }) => {
      if (id) {
        const { error } = await supabase.from('inv_items').update(payload).eq('id', id);
        if (error) throw error;
        return;
      }
      const { data: newItem, error } = await supabase.from('inv_items').insert(payload).select().single();
      if (error) throw error;

      if (initialStock && initialStock.qty > 0 && branchId) {
        const baseQty = initialStock.qty * payload.purchase_unit_qty;
        const unitCost = baseQty > 0 ? initialStock.total / baseQty : 0;
        const { error: txnErr } = await supabase.from('inv_stock_transactions').insert({
          item_id: newItem.id,
          branch_id: branchId,
          txn_type: 'stock_in',
          transaction_date: initialStock.date,
          quantity_delta: baseQty,
          unit_cost_snapshot: unitCost,
          supplier_id: initialStock.supplierId,
          reference_type: 'purchase',
          reference_note: 'สต๊อกเริ่มต้นตอนเพิ่มสินค้าใหม่',
          performed_by: performedBy,
        });
        if (txnErr) throw new Error('เพิ่มสินค้าสำเร็จ แต่บันทึกสต๊อกเริ่มต้นไม่สำเร็จ: ' + txnErr.message);
        await syncLegacyStock(payload, baseQty, unitCost, 'ซื้อเข้า', initialStock.date, performedBy);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ITEMS_KEY });
      qc.invalidateQueries({ queryKey: STOCK_KEY(branchId) });
    },
  });
}

export function useToggleItemActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, nextActive }: { id: string; nextActive: boolean }) => {
      const { error } = await supabase.from('inv_items').update({ is_active: nextActive }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY }),
  });
}

export async function countItemTransactions(itemId: string): Promise<number> {
  const { count, error } = await supabase
    .from('inv_stock_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('item_id', itemId);
  if (error) throw error;
  return count || 0;
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inv_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ITEMS_KEY }),
  });
}

export function useUpdateMinStock() {
  const qc = useQueryClient();
  const branchId = useBranchId();
  return useMutation({
    mutationFn: async ({ itemId, newMin }: { itemId: string; newMin: number }) => {
      const { error } = await supabase.rpc('inv_fn_set_min_stock_level', {
        p_item_id: itemId,
        p_branch_id: branchId,
        p_new_min: newMin,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STOCK_KEY(branchId) }),
  });
}
