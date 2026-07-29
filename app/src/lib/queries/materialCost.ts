import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

/** ต้นทุนวัสดุคลังของช่วงวันที่ที่เลือก — อ่านจาก inv_stock_transactions (ledger จริง) โดยตรง แทนที่จะ
 *  พึ่งตารางเก่า sc_stock_transactions ที่ระบบเดิมใช้ ซึ่งมีบั๊ก: ข้ามสินค้าที่ purchase_unit_qty !== 1
 *  ไปเงียบๆ ทำให้ยอดในหน้าภาพรวมขาดหายสำหรับสินค้าที่ซื้อเป็นแพ็ค/ลัง (ดูรายละเอียดที่คุยกันตอนต้น) —
 *  scope เดียวกับที่ dual-write เดิมเคยเขียนไป sc_stock_transactions: stock_in ทุกแถว บวก
 *  adjustment_decrease ที่เป็นการแก้ไข/ยกเลิกรายการซื้อ (reference_type='correction') เท่านั้น ไม่รวม
 *  adjustment_increase/decrease จากการตรวจนับสต๊อกจริง (ไม่ใช่ต้นทุนที่จ่ายเงินจริง)
 *
 *  หมายเหตุสำคัญ: ห้ามใช้คอลัมน์ total_cost (generated column = abs(quantity_delta)*unit_cost_snapshot)
 *  มาบวกรวมตรงๆ เพราะ abs() ทำให้รายการยกเลิก/แก้ไข (quantity_delta ติดลบ) กลายเป็นบวกเพิ่มยอดแทนที่จะ
 *  หักออก ต้องคำนวณ quantity_delta * unit_cost_snapshot เอง (คงเครื่องหมายไว้) — เจอบั๊กคลาสเดียวกันนี้
 *  มาแล้วครั้งหนึ่งกับ invSyncLegacyStock ตอนกลางเซสชัน */
export function useMaterialCostInRange(from: string, to: string) {
  return useQuery({
    queryKey: ['inv_material_cost', from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inv_stock_transactions')
        .select('txn_type, reference_type, quantity_delta, unit_cost_snapshot')
        .eq('status', 'approved')
        .gte('transaction_date', from)
        .lte('transaction_date', to)
        .in('txn_type', ['stock_in', 'adjustment_decrease']);
      if (error) throw error;
      const rows = (data || []).filter(
        (r) => r.txn_type === 'stock_in' || (r.txn_type === 'adjustment_decrease' && r.reference_type === 'correction'),
      );
      return rows.reduce((sum, r) => sum + Number(r.quantity_delta) * Number(r.unit_cost_snapshot), 0);
    },
  });
}
