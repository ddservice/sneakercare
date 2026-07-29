import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface OpexRow {
  month: string; // MM/YYYY
  category: string;
  key: string;
  name: string;
  amount: number;
  pay_method: string;
}

const KEY = (monthKey: string) => ['sc_opex', monthKey];

export function useOpexMonth(monthKey: string) {
  return useQuery({
    queryKey: KEY(monthKey),
    queryFn: async () => {
      const { data, error } = await supabase.from('sc_opex').select('*').eq('month', monthKey);
      if (error) throw error;
      return data as OpexRow[];
    },
  });
}

export const OPEX_ITEMS = [
  { key: 'rent', name: 'ค่าเช่าร้าน' },
  { key: 'electricity', name: 'ค่าไฟฟ้า' },
  { key: 'water', name: 'ค่าน้ำประปา' },
  { key: 'internet', name: 'ค่าอินเทอร์เน็ต' },
] as const;

export interface MiscItem { name: string; amount: number; method: string }

export interface SaveOpexFixedInput {
  monthKey: string;
  fixed: Record<string, { amount: number; method: string }>;
  miscItems: MiscItem[];
  recordedBy: string;
  username: string;
  role: string;
}

/** บันทึกเฉพาะค่าใช้จ่ายดำเนินการคงที่ (rent/electricity/water/internet/misc) — ไม่แตะ key ของ
 *  payroll/ภาษี/ห้องเช่า ที่อาจมีอยู่แล้วในเดือนเดียวกันจากระบบเดิม (upsert เท่านั้น ไม่ลบ key อื่น) */
export function useSaveOpexFixed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveOpexFixedInput) => {
      const now = new Date();
      const nowStr =
        now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) +
        ' เวลา ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      const rows: (Omit<OpexRow, 'month'> & { month: string; recorded_by: string; last_updated: string })[] = [];
      OPEX_ITEMS.forEach((item) => {
        const f = input.fixed[item.key] || { amount: 0, method: 'บัญชีร้าน' };
        rows.push({
          month: input.monthKey, category: 'ค่าดำเนินการ', key: item.key, name: item.name,
          amount: f.amount, pay_method: f.method, recorded_by: input.recordedBy, last_updated: new Date().toISOString(),
        });
      });
      const miscTotal = input.miscItems.reduce((s, m) => s + m.amount, 0);
      // แต่ละรายการจิปาถะเลือกช่องทางชำระเงินของตัวเอง (เก็บละเอียดใน misc_items_json) — แถวสรุปนี้เก็บ
      // ไว้แค่ยอดรวมเพื่อความเข้ากันได้กับรายงานเดิมที่ query key 'misc' โดยตรง ไม่ได้สื่อความหมายช่องทางเดียวอีกต่อไป
      rows.push({
        month: input.monthKey, category: 'ค่าดำเนินการ', key: 'misc', name: 'ค่าใช้จ่ายจิปาถะอื่นๆ',
        amount: miscTotal, pay_method: '-', recorded_by: input.recordedBy, last_updated: new Date().toISOString(),
      });
      if (input.miscItems.length > 0) {
        rows.push({
          month: input.monthKey, category: 'payslip_detail', key: 'misc_items_json',
          name: JSON.stringify(input.miscItems), amount: 0, pay_method: '-',
          recorded_by: input.recordedBy, last_updated: new Date().toISOString(),
        });
      }
      rows.push({
        month: input.monthKey, category: 'payslip_detail', key: 'audit_log',
        name: `บันทึกโดย: ${input.recordedBy} (${input.username}) เมื่อ ${nowStr}`,
        amount: now.getTime(), pay_method: input.role, recorded_by: input.recordedBy, last_updated: new Date().toISOString(),
      });

      const { error } = await supabase.from('sc_opex').upsert(rows, { onConflict: 'month,key' });
      if (error) throw error;
    },
    onSuccess: (_data, input) => qc.invalidateQueries({ queryKey: KEY(input.monthKey) }),
  });
}
