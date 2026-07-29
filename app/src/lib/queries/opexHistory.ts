import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface OpexHistoryItem { category: string; amount: number }
export interface OpexHistoryRow {
  id: number;
  month: string;
  version: number;
  saved_by: string;
  saved_at: string;
  change_note: string | null;
  items: OpexHistoryItem[];
}

export function useOpexHistory(monthKey: string | null) {
  return useQuery({
    queryKey: ['sc_opex_history', monthKey],
    queryFn: async () => {
      let query = supabase.from('sc_opex_history').select('*').order('version', { ascending: false }).limit(30);
      if (monthKey) query = query.eq('month', monthKey);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((h) => ({
        ...h,
        items: typeof h.items === 'string' ? JSON.parse(h.items) : h.items || [],
      })) as OpexHistoryRow[];
    },
  });
}
