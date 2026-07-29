import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useOpexMonth } from './opex';
import { ROOMS_COUNT, type RoomConfig } from './rooms';

export interface RoomMonthReading {
  prev: number;
  curr: number;
  rent: number;
}

export function useRentalIncomeMonth(monthKey: string) {
  return useOpexMonth(monthKey);
}

export function loadRoomReadings(opexRows: { key: string; amount: number }[] | undefined, rooms: RoomConfig[]): RoomMonthReading[] {
  const getAmt = (key: string) => opexRows?.find((o) => o.key === key)?.amount;
  return rooms.map((r, i) => ({
    prev: getAmt(`room_prev_meter_${i}`) ?? 0,
    curr: getAmt(`room_curr_meter_${i}`) ?? 0,
    rent: getAmt(`room_rent_saved_${i}`) ?? r.rent,
  }));
}

export interface SaveRentalIncomeInput {
  monthKey: string;
  rooms: RoomConfig[];
  readings: RoomMonthReading[];
  recordedBy: string;
}

/** บันทึกมิเตอร์+ค่าเช่ารายเดือนต่อห้อง (upsert เท่านั้น ไม่ลบ key อื่นในเดือนเดียวกัน เหมือนส่วนอื่นของ
 *  แท็บนี้) — category 'rental_meter' สำหรับมิเตอร์/ค่าเช่าที่บันทึกไว้ (ไม่ใช่ตัวเงินที่ต้องรวม), และ
 *  'rental_income' สำหรับยอดรายรับจริงต่อห้องที่หน้าภาพรวมจะไปรวมเป็น "รายรับรวมสุทธิ" */
export function useSaveRentalIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveRentalIncomeInput) => {
      const rows: Array<{ month: string; category: string; key: string; name: string; amount: number; pay_method: string; recorded_by: string; last_updated: string }> = [];
      const push = (category: string, key: string, name: string, amount: number, method: string) =>
        rows.push({ month: input.monthKey, category, key, name, amount, pay_method: method, recorded_by: input.recordedBy, last_updated: new Date().toISOString() });

      for (let i = 0; i < ROOMS_COUNT; i++) {
        const room = input.rooms[i];
        const reading = input.readings[i];
        const units = Math.max(reading.curr - reading.prev, 0);
        const elecCost = units * room.elec_rate;
        const total = reading.rent + elecCost;

        push('rental_meter', `room_prev_meter_${i}`, `มิเตอร์ก่อนหน้า: ${room.name}`, reading.prev, '-');
        push('rental_meter', `room_curr_meter_${i}`, `มิเตอร์ล่าสุด: ${room.name}`, reading.curr, '-');
        push('rental_meter', `room_rent_saved_${i}`, `ค่าเช่า: ${room.name}`, reading.rent, '-');
        push('rental_income', `room_income_${i}`, `รายรับห้องเช่า: ${room.name}`, total, 'เงินสด/โอน');
      }

      const { error } = await supabase.from('sc_opex').upsert(rows, { onConflict: 'month,key' });
      if (error) throw error;
    },
    onSuccess: (_d, input) => qc.invalidateQueries({ queryKey: ['sc_opex', input.monthKey] }),
  });
}
