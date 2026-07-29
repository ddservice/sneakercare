import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface SaleRow {
  date: string; // ISO
  extra_items: string | null;
  size_s: number;
  size_m: number;
  size_l: number;
  size_xl: number;
  total_revenue: number;
  cash_amount: number;      // DB column — historically stores the UI "transfer" figure (swapped)
  transfer_amount: number;  // DB column — historically stores the UI "cash" figure (swapped)
  recorded_by: string | null;
  discount: number;
  grand_total: number;
  payment_status: string;
  amount_paid: number;
}

export interface PaymentRow {
  id: number;
  sale_date: string;
  received_date: string;
  amount: number;
  pay_method: string;
  notes: string | null;
  recorded_by: string | null;
}

const SALES_KEY = (from: string, to: string) => ['sc_sales', from, to];
const PAYMENTS_KEY = (from: string, to: string) => ['sc_payments_for_sales', from, to];

export function useSales(from: string, to: string) {
  return useQuery({
    queryKey: SALES_KEY(from, to),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sc_sales')
        .select('*')
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false });
      if (error) throw error;
      return data as SaleRow[];
    },
  });
}

/** ดึงยอดที่รับเพิ่มทีหลัง (นอกเหนือจากตอนบันทึกยอดขายแรก) ต่อ sale_date จาก sc_payments โดยตรง
 *  (ระบบเดิมใช้ localStorage ล้วนสำหรับตัวเลขนี้ ซึ่งเป็นสาเหตุที่ทำให้ข้อมูลไม่ sync ข้ามเครื่อง —
 *  ที่นี่อ่านจาก DB ตรงๆ แทน) */
export function useSalePayments(from: string, to: string) {
  return useQuery({
    queryKey: PAYMENTS_KEY(from, to),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sc_payments')
        .select('*')
        .gte('sale_date', from)
        .lte('sale_date', to)
        .order('received_date', { ascending: false });
      if (error) throw error;
      const rows = data as PaymentRow[];
      const byDate = new Map<string, number>();
      rows.forEach((p) => byDate.set(p.sale_date, (byDate.get(p.sale_date) || 0) + Number(p.amount)));
      return { rows, byDate };
    },
  });
}

export interface SaleInput {
  date: string;
  extraItems: string;
  sizeS: number;
  sizeM: number;
  sizeL: number;
  sizeXl: number;
  grossAmount: number;
  discount: number;
  totalAmount: number;
  transferAmount: number; // UI concept
  cashAmount: number;     // UI concept
  paymentStatus: string;
  receivedAmount: number;
  recordedBy: string;
}

export function useSaveSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaleInput) => {
      // สลับคอลัมน์ตามที่ระบบเดิมทำมาตลอด: DB.cash_amount = UI.transferAmount, DB.transfer_amount = UI.cashAmount
      const { error } = await supabase.from('sc_sales').upsert(
        {
          date: input.date,
          extra_items: input.extraItems,
          size_s: input.sizeS,
          size_m: input.sizeM,
          size_l: input.sizeL,
          size_xl: input.sizeXl,
          total_revenue: input.totalAmount,
          cash_amount: input.transferAmount,
          transfer_amount: input.cashAmount,
          recorded_by: input.recordedBy,
          discount: input.discount,
          grand_total: input.grossAmount,
          payment_status: input.paymentStatus,
          amount_paid: input.receivedAmount,
          last_updated: new Date().toISOString(),
        },
        { onConflict: 'date' },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sc_sales'] }),
  });
}

export interface PaymentInput {
  saleDate: string;
  receivedDate: string;
  amount: number;
  payMethod: string;
  recordedBy: string;
}

export function useSavePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: PaymentInput) => {
      const { error } = await supabase.from('sc_payments').insert({
        sale_date: input.saleDate,
        received_date: input.receivedDate,
        amount: input.amount,
        pay_method: input.payMethod,
        notes: '',
        recorded_by: input.recordedBy,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sc_payments_for_sales'] });
      qc.invalidateQueries({ queryKey: ['sc_sales'] });
    },
  });
}
