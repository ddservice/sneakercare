import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export const UI_PERM_FEATURES = [
  { key: 'card_user_mgmt', label: 'จัดการบัญชีผู้ใช้งานระบบ' },
  { key: 'card_data_purge', label: 'ทำความสะอาดข้อมูล (Data Purge)' },
  { key: 'card_data_import', label: 'นำเข้า/ส่งออกข้อมูล Excel' },
  { key: 'tab_settings', label: 'แท็บตั้งค่า (ทั้งหมด)' },
  { key: 'inv_card_items', label: 'จัดการสินค้า (คลังสินค้า)' },
  { key: 'inv_card_suppliers', label: 'จัดการ Supplier / ร้านค้า' },
  { key: 'inv_card_stock_in', label: 'รับของเข้าคลัง' },
  { key: 'inv_card_adjustment', label: 'ปรับปรุงสต๊อกจากตรวจนับ' },
  { key: 'inv_card_pending', label: 'อนุมัติการปรับปรุงสต๊อก' },
  { key: 'inv_card_audit', label: 'ประวัติการเคลื่อนไหวสต๊อก' },
  { key: 'inv_card_purchase_history', label: 'ประวัติการซื้อเข้า' },
  { key: 'inv_card_settings', label: 'ตั้งค่า Telegram แจ้งเตือนสต๊อก' },
  { key: 'inv_cost_col_head', label: 'เห็นต้นทุน/ราคาในคลังสินค้า' },
] as const;

export type PermRole = 'co-admin' | 'manager';

const KEY = ['ui_permissions'];

export function useUiPermissions() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('ui_permissions').select('role, feature_key, visible');
      if (error) throw error;
      const map = new Map<string, boolean>();
      (data || []).forEach((r) => map.set(`${r.role}:${r.feature_key}`, r.visible));
      return map;
    },
  });
}

export function useSaveUiPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: { role: PermRole; feature_key: string; visible: boolean }[]) => {
      const { error } = await supabase.from('ui_permissions').upsert(rows, { onConflict: 'role,feature_key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
