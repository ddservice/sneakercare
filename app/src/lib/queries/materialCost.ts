import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';

/** ต้นทุนวัสดุคลังของช่วงวันที่ที่เลือก — อ่านจาก inv_stock_transactions (ledger จริง) โดยตรง แทนที่จะ
 *  พึ่งตารางเก่า sc_stock_transactions ที่ระบบเดิมใช้ ซึ่งมีบั๊ก: ข้ามสินค้าที่ purchase_unit_qty !== 1
 *  ไปเงียบๆ ทำให้ยอดในหน้าภาพรวมขาดหายสำหรับสินค้าที่ซื้อเป็นแพ็ค/ลัง (ดูรายละเอียดที่คุยกันตอนต้น)
 *
 *  นับเฉพาะแถว stock_in ที่ "ยังไม่ถูกแก้ไข/ยกเลิก" ในภายหลัง (ไม่มีแถวไหนอ้าง corrects_txn_id มาที่แถว
 *  นี้) — แถวเดิมที่ถูกแก้ไขแล้วไม่นับ ส่วนแถวที่แก้ไขใหม่ (เป็น stock_in แถวใหม่) จะถูกนับแทนโดยอัตโนมัติ
 *  อยู่แล้วเพราะเป็น stock_in เหมือนกัน — **ไม่บวกลบด้วยแถว adjustment_decrease (reversal) เลย** เพราะ
 *  reversal คำนวณด้วยต้นทุนถัวเฉลี่ยเคลื่อนที่ ณ ตอนที่ยกเลิก (จาก fn_apply_stock_transaction) ซึ่งมักไม่เท่า
 *  กับต้นทุนที่บันทึกไว้ตอนซื้อจริงของแถวเดิมเป๊ะ (ค่าเฉลี่ยขยับไปแล้วจากการซื้อ/แก้ไขรายการอื่นคั่นกลาง) —
 *  ถ้าเอา reversal มาบวกลบตรงๆ ตามที่เคยทำ ยอดรวมทั้งเดือนจะเพี้ยนไปเท่ากับส่วนต่างนั้นทุกครั้งที่มีการแก้ไข
 *  รายการซื้อ (เจอเคสจริง: "น้ำยาขจัดคราบสีฟ้า" เดือน ก.พ. ที่ถูกแก้ไขจำนวนจากผิดเป็นถูก ทำให้ยอดเดือนนั้น
 *  หายไป 567.27 บาท ทั้งที่ตัวเลขจริงถูกต้องแล้ว)
 *
 *  หมายเหตุสำคัญ: ห้ามใช้คอลัมน์ total_cost (generated column = abs(quantity_delta)*unit_cost_snapshot)
 *  มาบวกรวมตรงๆ เพราะ abs() ทำให้รายการยกเลิก/แก้ไข (quantity_delta ติดลบ) กลายเป็นบวกเพิ่มยอดแทนที่จะ
 *  หักออก ต้องคำนวณ quantity_delta * unit_cost_snapshot เอง (คงเครื่องหมายไว้) — เจอบั๊กคลาสเดียวกันนี้
 *  มาแล้วครั้งหนึ่งกับ invSyncLegacyStock ตอนกลางเซสชัน */
export function useMaterialCostInRange(from: string, to: string) {
  return useQuery({
    queryKey: ['inv_material_cost', from, to],
    queryFn: async () => {
      const [{ data: stockInRows, error: e1 }, { data: correctionRows, error: e2 }] = await Promise.all([
        supabase
          .from('inv_stock_transactions')
          .select('id, quantity_delta, unit_cost_snapshot')
          .eq('status', 'approved')
          .eq('txn_type', 'stock_in')
          .gte('transaction_date', from)
          .lte('transaction_date', to),
        // ไม่จำกัดช่วงวันที่ตรงนี้ — รายการที่แก้ไขอาจมีวันที่ต่างจากรายการเดิมได้ในทางทฤษฎี ต้องดูทั้งหมด
        // เพื่อรู้ว่า stock_in แถวไหนบ้างที่ถูกแก้ไข/ยกเลิกไปแล้ว
        supabase
          .from('inv_stock_transactions')
          .select('corrects_txn_id')
          .eq('status', 'approved')
          .eq('txn_type', 'adjustment_decrease')
          .eq('reference_type', 'correction')
          .not('corrects_txn_id', 'is', null),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;

      const supersededIds = new Set((correctionRows || []).map((r) => r.corrects_txn_id));
      const rows = (stockInRows || []).filter((r) => !supersededIds.has(r.id));
      return rows.reduce((sum, r) => sum + Number(r.quantity_delta) * Number(r.unit_cost_snapshot), 0);
    },
  });
}
