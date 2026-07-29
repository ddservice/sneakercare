import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useBranchId } from './branch';

export interface SecretStatus {
  is_set: boolean;
  value_suffix?: string;
  updated_at?: string;
}

const KEY = ['inv_telegram_settings'];

/** ตาม CLAUDE.md ข้อ 9: Bot Token อ่านค่าจริงกลับมาแสดงใน UI ไม่ได้เด็ดขาด แม้แต่ Admin — ใช้
 *  inv_fn_integration_secret_status() ที่คืนแค่สถานะ + ท้ายรหัส 4 ตัวเท่านั้น */
export function useTelegramSettings() {
  const branchId = useBranchId();
  return useQuery({
    queryKey: [...KEY, branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const { data: statusRows } = await supabase.rpc('inv_fn_integration_secret_status', { p_key: 'telegram_bot_token' });
      const status: SecretStatus = statusRows?.[0] || { is_set: false };
      const { data: branch } = await supabase.from('inv_branches').select('telegram_chat_id').eq('id', branchId).maybeSingle();
      return { status, chatId: branch?.telegram_chat_id || '' };
    },
  });
}

export function useSaveTelegramSettings() {
  const qc = useQueryClient();
  const branchId = useBranchId();
  return useMutation({
    mutationFn: async ({ token, chatId }: { token: string; chatId: string }) => {
      if (token) {
        const { error } = await supabase.rpc('inv_fn_set_integration_secret', { p_key: 'telegram_bot_token', p_value: token });
        if (error) throw error;
      }
      const { error: branchErr } = await supabase.from('inv_branches').update({ telegram_chat_id: chatId || null }).eq('id', branchId);
      if (branchErr) throw branchErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
