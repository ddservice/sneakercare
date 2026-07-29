import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface PendingRow {
  id: string;
  quantity_delta: number;
  reason: string | null;
  txn_type: string;
  item_id: string;
  performed_by: string;
}

const KEY = ['inv_pending_approvals'];

export function usePendingAdjustments() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inv_stock_transactions')
        .select('id, quantity_delta, reason, txn_type, item_id, performed_by')
        .eq('status', 'pending_approval')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as PendingRow[];
    },
  });
}

export function useApproveAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ txnId, approve }: { txnId: string; approve: boolean }) => {
      const { error } = await supabase.rpc('inv_fn_approve_adjustment', { p_txn_id: txnId, p_approve: approve });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['inv_item_stock'] });
      qc.invalidateQueries({ queryKey: ['inv_purchase_history'] });
    },
  });
}
