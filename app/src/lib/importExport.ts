import * as XLSX from 'xlsx';
import { supabase } from './supabase';
import type { Item } from './queries/items';
import type { Supplier } from './queries/suppliers';

export const SALES_HEADERS = [
  'วันที่ (YYYY-MM-DD)', 'Size_S (Qty)', 'Size_M (Qty)', 'Size_L (Qty)', 'Size_XL (Qty)',
  'ยอดรวมสุทธิที่ชำระ (บาท)', 'ยอดโอน (บาท)', 'ยอดเงินสด (บาท)', 'พนักงานผู้บันทึก',
];

export const STOCK_HEADERS = [
  'วันที่รับของ (YYYY-MM-DD)', 'ชื่อสินค้า (ต้องตรงกับในระบบเป๊ะ)', 'จำนวน (หน่วยซื้อ)',
  'ยอดที่จ่ายจริงทั้งหมด (บาท)', 'Supplier (ถ้ามี ต้องตรงกับในระบบ)',
];

export function downloadTemplate(type: 'sales' | 'stock') {
  const headers = type === 'sales' ? SALES_HEADERS : STOCK_HEADERS;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, type === 'sales' ? 'SneakerCare_Sales_Template.xlsx' : 'SneakerCare_Stock_Template.xlsx');
}

export function parseExcelFile(file: File): Promise<unknown[][]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        // cellDates: true — ถ้าผู้ใช้พิมพ์วันที่ผ่าน date picker ของ Excel (ไม่ใช่พิมพ์ข้อความ) เซลล์จะถูก
        // เก็บเป็นตัวเลข serial date ไม่ใช่สตริง ถ้าไม่ตั้งค่านี้จะ parse เป็นตัวเลขเพี้ยนๆ แทนวันที่จริง
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
        resolve(rows);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

export interface ImportResult {
  successCount: number;
  failCount: number;
  errors: string[];
}

const asNum = (v: unknown) => Number(v) || 0;
const asStr = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** รับได้ทั้งข้อความ "YYYY-MM-DD" และเซลล์วันที่จริงของ Excel (เมื่อผู้ใช้พิมพ์ผ่าน date picker แทนพิมพ์
 *  ข้อความ) — คืนค่า null ถ้าแปลงเป็นวันที่ที่ถูกต้องไม่ได้เลย */
function normalizeDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  const s = asStr(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function importSalesRows(rows: unknown[][], recordedByFallback: string): Promise<ImportResult> {
  const result: ImportResult = { successCount: 0, failCount: 0, errors: [] };
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row?.length || !row[0]) continue;
    const date = normalizeDate(row[0]);
    if (!date) {
      result.failCount++;
      result.errors.push(`แถว ${r + 1}: รูปแบบวันที่ไม่ถูกต้อง (${asStr(row[0])}) ต้องเป็น YYYY-MM-DD`);
      continue;
    }
    const sizeS = asNum(row[1]);
    const sizeM = asNum(row[2]);
    const sizeL = asNum(row[3]);
    const sizeXl = asNum(row[4]);
    const totalRevenue = asNum(row[5]);
    const transferAmount = asNum(row[6]);
    const cashAmount = asNum(row[7]);
    const recordedBy = asStr(row[8]) || recordedByFallback;

    // DB columns สลับกันมาตั้งแต่เดิม: cash_amount = ยอดโอน(UI), transfer_amount = ยอดสด(UI) — ดู queries/sales.ts
    const { error } = await supabase.from('sc_sales').upsert(
      {
        date, size_s: sizeS, size_m: sizeM, size_l: sizeL, size_xl: sizeXl,
        total_revenue: totalRevenue, cash_amount: transferAmount, transfer_amount: cashAmount,
        recorded_by: recordedBy, discount: 0, grand_total: totalRevenue,
        payment_status: 'ชำระครบ', amount_paid: totalRevenue, last_updated: new Date().toISOString(),
      },
      { onConflict: 'date' },
    );
    if (error) { result.failCount++; result.errors.push(`แถว ${r + 1} (${date}): ${error.message}`); }
    else result.successCount++;
  }
  return result;
}

export async function importStockRows(
  rows: unknown[][],
  items: Item[],
  suppliers: Supplier[],
  branchId: string,
  performedBy: string,
): Promise<ImportResult> {
  const result: ImportResult = { successCount: 0, failCount: 0, errors: [] };
  const itemByName = new Map(items.map((i) => [i.name.trim(), i]));
  const supplierByName = new Map(suppliers.map((s) => [s.name.trim(), s]));

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row?.length || !row[0]) continue;
    const date = normalizeDate(row[0]);
    const itemName = asStr(row[1]);
    const purchaseQty = asNum(row[2]);
    const total = asNum(row[3]);
    const supplierName = asStr(row[4]);

    if (!date) {
      result.failCount++;
      result.errors.push(`แถว ${r + 1}: รูปแบบวันที่ไม่ถูกต้อง (${asStr(row[0])}) ต้องเป็น YYYY-MM-DD`);
      continue;
    }
    const item = itemByName.get(itemName);
    if (!item) {
      result.failCount++;
      result.errors.push(`แถว ${r + 1}: ไม่พบสินค้าชื่อ "${itemName}" ในระบบ — เพิ่มสินค้านี้ในแท็บคลังสินค้าก่อน`);
      continue;
    }
    if (purchaseQty <= 0) {
      result.failCount++;
      result.errors.push(`แถว ${r + 1}: จำนวนต้องมากกว่า 0`);
      continue;
    }
    const supplier = supplierName ? supplierByName.get(supplierName) : undefined;
    if (supplierName && !supplier) {
      result.failCount++;
      result.errors.push(`แถว ${r + 1}: ไม่พบ Supplier ชื่อ "${supplierName}" ในระบบ — เพิ่มก่อนหรือเว้นว่างไว้`);
      continue;
    }

    const baseQty = purchaseQty * item.purchase_unit_qty;
    const unitCost = baseQty > 0 ? total / baseQty : 0;
    const { error } = await supabase.from('inv_stock_transactions').insert({
      item_id: item.id, branch_id: branchId, txn_type: 'stock_in', transaction_date: date,
      quantity_delta: baseQty, unit_cost_snapshot: unitCost, supplier_id: supplier?.id ?? null,
      reference_type: 'purchase', reference_note: 'นำเข้าจากไฟล์ Excel', performed_by: performedBy,
    });
    if (error) { result.failCount++; result.errors.push(`แถว ${r + 1} (${itemName}): ${error.message}`); }
    else result.successCount++;
  }
  return result;
}
