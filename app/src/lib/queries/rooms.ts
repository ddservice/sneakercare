import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';

export interface RoomConfig {
  name: string;
  tenant: string;
  rent: number;
  elec_rate: number;
}

export const ROOMS_COUNT = 3;
const defaultRoom = (i: number): RoomConfig => ({ name: `ชั้น 3 ห้อง ${i + 1}`, tenant: '', rent: 0, elec_rate: 5 });

const KEY = ['sc_settings_rooms_config'];

/** อ่านค่าห้องเช่า (ชื่อ/ผู้เช่า/ค่าเช่า/อัตราค่าไฟ) จาก sc_settings key='rooms_config' — ตรวจสอบแล้วพบว่า
 *  ไม่เคยมีแถวนี้อยู่ในฐานข้อมูลจริงเลย (ระบบเดิมเขียนแค่ลง localStorage เท่านั้น แม้โค้ดจะตั้งใจเขียนขึ้น
 *  Supabase ด้วยก็ตาม) ดังนั้นจะได้ค่า default ว่างเปล่าเสมอในตอนแรก ไม่ใช่บั๊กของหน้านี้ — รายรับห้องเช่า
 *  รายเดือนที่เคยบันทึกไว้จริง (sc_opex category rental_income) ไม่ได้หายไปไหน อ่านได้ปกติแยกจากนี้ */
export function useRoomsConfig() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data, error } = await supabase.from('sc_settings').select('value').eq('key', 'rooms_config').maybeSingle();
      if (error) throw error;
      let rooms: RoomConfig[] = [];
      if (data?.value) {
        try { rooms = JSON.parse(data.value) || []; } catch { rooms = []; }
      }
      while (rooms.length < ROOMS_COUNT) rooms.push(defaultRoom(rooms.length));
      return rooms.slice(0, ROOMS_COUNT);
    },
  });
}

export function useSaveRoomsConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rooms: RoomConfig[]) => {
      const { error } = await supabase
        .from('sc_settings')
        .upsert({ key: 'rooms_config', value: JSON.stringify(rooms) }, { onConflict: 'key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
