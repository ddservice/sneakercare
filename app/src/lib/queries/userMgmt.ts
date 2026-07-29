import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import type { Role } from '../types';

export interface UserRow {
  username: string;
  fullname: string | null;
  nickname: string | null;
  role: Role;
}

const KEY = ['sc_users_admin'];

export function useUsers() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('sc_users').select('*').order('id');
      if (error) throw error;
      return data as UserRow[];
    },
  });
}

export interface CreateUserInput {
  username: string;
  fullname: string;
  nickname: string;
  password: string;
  role: Role;
}

/** สร้างทั้ง Auth user + profile ผ่าน Edge Function เท่านั้น (ตรวจสิทธิ์ Admin ฝั่งเซิร์ฟเวอร์ก่อนเสมอ)
 *  ไม่เปิดช่องให้ anon key สร้าง Auth user ตรงๆ จากฝั่ง browser */
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateUserInput) => {
      const { data, error } = await supabase.functions.invoke('create-user', { body: input });
      if (error) {
        let msg = error.message || 'สร้างไม่สำเร็จ';
        try {
          const errWithContext = error as { context?: { json?: () => Promise<{ error?: string }> } };
          if (errWithContext.context?.json) {
            const body = await errWithContext.context.json();
            if (body?.error) msg = body.error;
          }
        } catch {
          // ใช้ msg เดิมถ้า parse ไม่ได้
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ username, fullname, nickname, role }: { username: string; fullname: string; nickname: string; role: Role }) => {
      const { error } = await supabase.from('sc_users').update({ fullname, nickname, role }).eq('username', username);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** ลบได้แค่แถว profile (sc_users) — anon key ลบ Supabase Auth user จริงไม่ได้ ต้องไปลบเพิ่มเองที่
 *  Supabase Dashboard > Authentication > Users มิฉะนั้นบัญชียังล็อกอินได้อยู่แม้ profile หายไปแล้ว */
export function useDeleteUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) => {
      const { error } = await supabase.from('sc_users').delete().eq('username', username);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
