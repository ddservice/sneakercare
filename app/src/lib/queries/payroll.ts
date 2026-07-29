import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { type OpexRow, useOpexMonth } from './opex';
import type { Employee } from './employees';

export interface DeductItem {
  type: 'ขาด' | 'ลา' | 'มาสาย' | 'อื่นๆ';
  detail: string;
  minutes: number;
  rate: number;
  amount: number;
}

export interface EmployeePayrollDraft {
  commPct: number;
  diligence: number;
  ot: number;
  deductItems: DeductItem[];
}

const getAmt = (rows: OpexRow[], key: string): number | null => {
  const r = rows.find((o) => o.key === key);
  return r ? r.amount : null;
};
const getStr = (rows: OpexRow[], key: string): string => rows.find((o) => o.key === key)?.name || '';

export function usePayrollMonth(monthKey: string) {
  return useOpexMonth(monthKey);
}

export function loadEmployeeDraft(rows: OpexRow[], empName: string): EmployeePayrollDraft {
  const commPct = getAmt(rows, `empd_comm_pct_${empName}`) ?? 0;
  const diligence = getAmt(rows, `empd_diligence_${empName}`) ?? 0;
  const ot = getAmt(rows, `empd_ot_${empName}`) ?? 0;
  let deductItems: DeductItem[] = [];
  const json = getStr(rows, `empd_deduct_json_${empName}`);
  if (json) {
    try { deductItems = JSON.parse(json) || []; } catch { deductItems = []; }
  }
  return { commPct, diligence, ot, deductItems };
}

export const PCT_OPTIONS = [0, 1, 1.5, 2, 2.5, 3];

export const emptyDraft = (): EmployeePayrollDraft => ({ commPct: 0, diligence: 0, ot: 0, deductItems: [] });

export function computeCommission(monthSales: number, commPct: number): number {
  return commPct > 0 ? Math.round((monthSales * commPct) / 100) : 0;
}
export function sumDeductions(items: DeductItem[]): number {
  return items.reduce((s, it) => s + (it.amount || 0), 0);
}
export function computeSso(salary: number): number {
  return Math.round(Math.min(salary, 15000) * 0.05);
}
export function computeWht(commAmt: number): number {
  return Math.round(commAmt * 0.03);
}
export function computeNet(
  salary: number, commAmt: number, diligence: number, ot: number, deductTotal: number,
): number {
  const sso = computeSso(salary);
  const wht = computeWht(commAmt);
  return salary + commAmt + diligence + ot - sso - wht - deductTotal;
}

export interface EmployeePayrollInput {
  employee: Employee;
  commPct: number;
  commAmt: number;
  diligence: number;
  ot: number;
  deductItems: DeductItem[];
}

export interface SavePayrollInput {
  monthKey: string;
  employees: EmployeePayrollInput[];
  recordedBy: string;
  username: string;
  role: string;
}

/** บันทึกเฉพาะ key ที่เกี่ยวกับเงินเดือน/ภาษี (upsert เท่านั้น ไม่ลบ key อื่นในเดือนเดียวกัน เช่น
 *  ค่าดำเนินการร้าน หรือรายรับห้องเช่า ที่อาจถูกบันทึกแยกจากส่วนอื่นของแอป) */
export function useSavePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SavePayrollInput) => {
      const now = new Date();
      const nowStr =
        now.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) +
        ' เวลา ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

      const rows: Array<{
        month: string; category: string; key: string; name: string; amount: number;
        pay_method: string; recorded_by: string; last_updated: string;
      }> = [];
      const push = (category: string, key: string, name: string, amount: number, method: string) =>
        rows.push({
          month: input.monthKey, category, key, name, amount, pay_method: method,
          recorded_by: input.recordedBy, last_updated: new Date().toISOString(),
        });

      let totalCommRaw = 0;
      let totalSsoEmp = 0;

      input.employees.forEach(({ employee: emp, commPct, commAmt, diligence, ot, deductItems }) => {
        const n = emp.name;
        const deductTotal = sumDeductions(deductItems);
        const net = computeNet(emp.salary, commAmt, diligence, ot, deductTotal);
        const wht = computeWht(commAmt);
        const sso = computeSso(emp.salary);
        totalCommRaw += commAmt;
        totalSsoEmp += sso;

        push('ค่าแรงพนักงาน', 'emp_' + n, `เงินจ่ายพนักงาน: ${n}`, net, 'บัญชีร้าน');
        push('payslip_detail', 'empd_comm_pct_' + n, 'empd_comm_pct_' + n + ': ' + n, commPct, '-');
        push('payslip_detail', 'empd_diligence_' + n, 'empd_diligence_' + n + ': ' + n, diligence, '-');
        push('payslip_detail', 'empd_ot_' + n, 'empd_ot_' + n + ': ' + n, ot, '-');
        push('payslip_detail', 'empd_wht_' + n, 'empd_wht_' + n + ': ' + n, wht, '-');
        push('payslip_detail', 'empd_deduct_total_' + n, 'empd_deduct_total_' + n + ': ' + n, deductTotal, '-');
        rows.push({
          month: input.monthKey, category: 'payslip_detail', key: 'empd_deduct_json_' + n,
          name: JSON.stringify(deductItems), amount: 0, pay_method: '-',
          recorded_by: input.recordedBy, last_updated: new Date().toISOString(),
        });
      });

      // ยอดภาษีรวมของทั้งเดือน — ปัดเศษจากยอดคอมมิชชันรวม (ไม่ใช่ผลรวมของ wht ที่ปัดแล้วรายคน) ตามที่
      // ระบบเดิมทำมาตลอด อาจต่างจากผลรวม wht รายคนไม่กี่สตางค์เพราะปัดเศษคนละจุด — คงพฤติกรรมเดิมไว้
      const commTaxTotal = Math.round(totalCommRaw * 0.03);
      push('ภาษี', 'withholding_tax', 'ภาษีหัก ณ ที่จ่าย 3% ค่าคอมมิชชัน', commTaxTotal, 'บัญชีภาษีนำส่ง');
      if (totalSsoEmp > 0) {
        push('ภาษี', 'sso_employee', 'ประกันสังคมส่วนลูกจ้าง 5%', totalSsoEmp, 'บัญชีนายจ้าง');
        push('ภาษี', 'sso_employer', 'ประกันสังคมส่วนนายจ้าง 5%', totalSsoEmp, 'บัญชีนายจ้าง');
      }
      push('payslip_detail', 'audit_log', `บันทึกโดย: ${input.recordedBy} (${input.username}) เมื่อ ${nowStr}`, now.getTime(), input.role);

      const { error } = await supabase.from('sc_opex').upsert(rows, { onConflict: 'month,key' });
      if (error) throw error;
    },
    onSuccess: (_d, input) => qc.invalidateQueries({ queryKey: ['sc_opex', input.monthKey] }),
  });
}
