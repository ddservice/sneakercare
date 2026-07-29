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
        last_updated: new Date().toISOString(),
      }));
      const { error } = await supabase.from('sc_employees').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
