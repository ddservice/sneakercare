import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface Employee {
  id?: number;
  name: string;
  nickname: string;
  salary: number;
  position: string;
  bank: string;
  account: string;
  status: 'Active' | 'Inactive';
  /** อยู่ระหว่างทดลองงาน ยังไม่ขึ้นทะเบียนประกันสังคม — ระบบจะไม่หักประกันสังคม (5%) ให้ตอนคำนวณเงินเดือน */
  sso_exempt: boolean;
}

const KEY = ['sc_employees'];

export function useEmployees() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('sc_employees').select('*').order('id');
      if (error) throw error;
      return data as Employee[];
    },
  });
}

/** ระบบเดิมแทนที่รายชื่อพนักงานทั้งชุดทุกครั้งที่บันทึก (ลบทั้งหมดแล้ว insert ใหม่) — คงพฤติกรรมเดิมไว้
 *  เพื่อให้ทั้งสองระบบเห็นข้อมูลตรงกันระหว่างที่ยังรันคู่กันอยู่ */
export function useSaveEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (list: Employee[]) => {
      const { error: delErr } = await supabase.from('sc_employees').delete().gte('id', 0);
      if (delErr) throw delErr;
      const rows = list.map((emp) => ({
        name: emp.name,
        salary: emp.salary || 0,
        position: emp.position || '',
        bank: emp.bank || '',
        account: emp.account || '',
        status: emp.status || 'Active',
        nickname: emp.nickname || '',
        sso_exempt: emp.sso_exempt || false,
        last_updated: new Date().toISOString(),
      }));
      const { error } = await supabase.from('sc_employees').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** สลับสถานะยกเว้นประกันสังคมของพนักงานคนเดียว ใช้ตอนอยู่หน้าจอเงินเดือน (ไม่ต้องไปที่หน้ารายชื่อ
 *  พนักงานเพื่อแก้ทีละคน) — มีผลทันทีเพราะเป็นข้อเท็จจริงของพนักงาน ไม่ใช่ค่าที่ตั้งเฉพาะเดือนนั้น */
export function useToggleSsoExempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ssoExempt }: { id: number; ssoExempt: boolean }) => {
      const { error } = await supabase.from('sc_employees').update({ sso_exempt: ssoExempt }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
