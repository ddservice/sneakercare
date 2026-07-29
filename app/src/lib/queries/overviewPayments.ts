import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

/** ดึง sc_payments ทั้งหมด (ไม่จำกัดช่วงวันที่) แล้วแยกเป็น 2 มุมมองที่ใช้ต่างกัน:
 *  - inRangeTotal: ยอดรับเงินจริงที่ "received_date" อยู่ในช่วงที่กำลังดู (ใช้คำนวณกำไรสุทธิแบบเงินสด
 *    นับตามเดือนที่ได้รับเงินจริง ไม่ใช่เดือนที่เกิดยอดขาย)
 *  - byDateAll: ยอดรับเพิ่มทีหลังทั้งหมด (ทุกช่วงเวลา) แยกตาม sale_date ของยอดขายต้นเรื่อง — ใช้หายอด
 *    ค้างชำระ (AR) ที่แท้จริง ไม่ผูกกับช่วงวันที่ที่กำลังดูอยู่ */
export function useOverviewPayments(from: string, to: string) {
  return useQuery({
    queryKey: ['sc_payments_overview'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sc_payments').select('sale_date, received_date, amount');
      if (error) throw error;
      const rows = data || [];
      const byDateAll = new Map<string, number>();
      rows.forEach((p) => byDateAll.set(p.sale_date, (byDateAll.get(p.sale_date) || 0) + Number(p.amount)));
      return { rows, byDateAll };
    },
    select: (result) => ({
      ...result,
      inRangeTotal: result.rows
        .filter((p) => p.received_date >= from && p.received_date <= to)
        .reduce((s, p) => s + Number(p.amount), 0),
    }),
  });
}
