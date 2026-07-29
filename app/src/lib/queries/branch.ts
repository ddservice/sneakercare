import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

export function useBranchId(): string | null {
  const { data } = useQuery({
    queryKey: ['inv_branch_id'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inv_branches')
        .select('id')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
    staleTime: Infinity,
  });
  return data ?? null;
}
