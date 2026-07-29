import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

function monthsInRange(fromStr: string, toStr: string): string[] {
  const [y1s, m1s] = fromStr.split('-');
  const [y2s, m2s] = toStr.split('-');
  let y1 = +y1s, m1 = +m1s;
  const y2 = +y2s, m2 = +m2s;
  const months: string[] = [];
  while (y1 < y2 || (y1 === y2 && m1 <= m2)) {
    months.push(String(m1).padStart(2, '0') + '/' + y1);
    m1++;
    if (m1 > 12) { m1 = 1; y1++; }
  }
  return months;
}

export interface OpexSummary {
  opexFixedAmt: number;
  staffSalaryAmt: number;
  taxAmt: number;
  rentalIncomeAmt: number;
}

/** ผลรวมค่าใช้จ่าย/รายรับตามหมวดหมู่จาก sc_opex สำหรับทุกเดือนที่คาบเกี่ยวช่วงวันที่ที่เลือก — ไม่รวม
 *  category 'payslip_detail' หรือ 'rental_meter' เด็ดขาด เพราะเป็นข้อมูลรายละเอียด/มิเตอร์ ไม่ใช่ตัวเงิน
 *  (payslip_detail มีแถว audit_log ที่ amount เก็บ timestamp เป็นตัวเลขหลักล้านล้าน ถ้ารวมผิดจะพังยอดทันที) */
export function useOpexSummaryInRange(from: string, to: string) {
  const months = monthsInRange(from, to);
  return useQuery({
    queryKey: ['sc_opex_summary', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.from('sc_opex').select('category, amount').in('month', months);
      if (error) throw error;
      const sum = (cat: string) => (data || []).filter((r) => r.category === cat).reduce((s, r) => s + Number(r.amount), 0);
      const result: OpexSummary = {
        opexFixedAmt: sum('ค่าดำเนินการ'),
        staffSalaryAmt: sum('ค่าแรงพนักงาน'),
        taxAmt: sum('ภาษี'),
        rentalIncomeAmt: sum('rental_income'),
      };
      return result;
    },
  });
}
