import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface BizSettings {
  name: string;
  phone: string;
  address: string;
  tax_id: string;
  logo_url: string;
  price_s: number;
  price_m: number;
  price_l: number;
  price_xl: number;
}

const KEY = ['sc_settings_biz'];

export function useBizSettings() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('sc_settings').select('key, value');
      if (error) throw error;
      const map = new Map((data || []).map((r) => [r.key, r.value as string]));
      const settings: BizSettings = {
        name: map.get('name') || 'Sneaker Care Shop',
        phone: map.get('phone') || '',
        address: map.get('address') || '',
        tax_id: map.get('tax_id') || '',
        logo_url: map.get('logo_url') || '',
        price_s: Number(map.get('price_s')) || 200,
        price_m: Number(map.get('price_m')) || 400,
        price_l: Number(map.get('price_l')) || 600,
        price_xl: Number(map.get('price_xl')) || 800,
      };
      return settings;
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (values: Record<string, string | number>) => {
      const rows = Object.entries(values).map(([key, value]) => ({ key, value: String(value) }));
      const { error } = await supabase.from('sc_settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
