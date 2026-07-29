import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface AuditLogRow {
  id: string;
  performed_at: string;
  performed_by: string | null;
  after_data: { txn_type?: string; item_id?: string; quantity_delta?: number; reason?: string; reference_note?: string } | null;
}

export function useStockAuditLog() {
  return useQuery({
    queryKey: ['inv_audit_logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inv_audit_logs')
        .select('*')
        .eq('table_name', 'inv_stock_transactions')
        .order('performed_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as AuditLogRow[];
    },
  });
}
