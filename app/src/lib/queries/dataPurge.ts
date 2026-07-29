import { useMutation } from '@tanstack/react-query';
import { supabase } from '../supabase';

export type PurgeCategory = 'all' | 'sales' | 'opex';

export interface PurgeInput {
  monthInput: string; // MM/YYYY
  category: PurgeCategory;
}

/** ลบข้อมูล sc_sales/sc_opex ทั้งเดือนถาวร — ใช้เฉพาะกรณีข้อมูลผิดพลาดทั้งเดือนจริงๆ ไม่แตะ
 *  inv_stock_transactions เพราะเป็น append-only ledger ห้ามลบแถวเดิม (ดู DataPurgeSection.tsx) */
export function usePurgeMonthData() {
  return useMutation({
    mutationFn: async ({ monthInput, category }: PurgeInput) => {
      const [mm, yyyy] = monthInput.split('/');
      const firstDay = `${yyyy}-${mm.padStart(2, '0')}-01`;
      const lastDay = new Date(Number(yyyy), Number(mm), 0).toISOString().split('T')[0];

      if (category === 'all' || category === 'sales') {
        const { error } = await supabase.from('sc_sales').delete().gte('date', firstDay).lte('date', lastDay);
        if (error) throw error;
      }
      if (category === 'all' || category === 'opex') {
        const { error } = await supabase.from('sc_opex').delete().eq('month', monthInput);
        if (error) throw error;
      }
    },
  });
}
