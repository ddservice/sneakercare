"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { ModalBackdrop } from "@/components/modal-shell";
import {
  type RosterStaff,
  updateEmployeeRosterDefaults,
  saveStaffDailyStat,
  fetchStaffDailyStats,
  applyGeneratedDayOffs,
  type StaffDailyStat,
} from "@/app/actions/roster";
import { thaiPublicHolidaysRange } from "@/lib/thai-holidays";
import { generateRosterPlan, shiftsFromShopHours } from "@/lib/roster-generate";
import { PageHeader } from "@/components/page-header";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Printer,
  Users,
  Sun,
  Sunset,
  Info,
  Download,
} from "lucide-react";

const DAY_NAMES_THAI = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];

// ✅ [multi-tenant 2026-09-17] รายชื่อพนักงานเดิม hardcode ไว้ตรงนี้ (เฉพาะของ tenant #1)
// — ตอนนี้ดึงจาก sc_employees จริงของแต่ละ tenant ผ่าน fetchRosterStaff() แล้วส่งเข้ามาทาง prop
// `initialStaff` แทน (ดู app/actions/roster.ts) ระบุกะ/วันหยุดมาตรฐานตั้งค่าได้เองต่อพนักงานที่
// การ์ดสรุปด้านล่าง ไม่ต้องแก้โค้ดอีกต่อไปเมื่อรับพนักงานใหม่หรือเปิด tenant ใหม่

export type ShiftPreset = {
  id: string;
  name: string;
  description: string;
  morningTime: string;
  lateTime: string;
};

export const SHIFT_PRESETS: ShiftPreset[] = [
  {
    id: "prep_close",
    name: "09:00 - 20:00 (รวมเวลาเตรียมร้าน & ปิดร้าน)",
    description: "กะเช้า 08:30 - 17:30 น. (เตรียมเปิดร้าน 9:00) · กะสาย 11:30 - 20:30 น. (ปิดร้าน 20:00 + เคลียร์ยอด 30 นาที)",
    morningTime: "08:30 - 17:30",
    lateTime: "11:30 - 20:30",
  },
  {
    id: "exact_hours",
    name: "09:00 - 20:00 (ตรงเวลาเปิด-ปิดร้าน)",
    description: "กะเช้า 09:00 - 18:00 น. · กะสาย 11:00 - 20:00 น.",
    morningTime: "09:00 - 18:00",
    lateTime: "11:00 - 20:00",
  },
  {
    id: "legacy",
    name: "กะเดิม (08:30-17:30 / 10:30-19:30)",
    description: "กะเช้า 08:30 - 17:30 น. · กะสาย 10:30 - 19:30 น.",
    morningTime: "08:30 - 17:30",
    lateTime: "10:30 - 19:30",
  },
];

/** ตารางกะมาตรฐานของวันหนึ่งๆ — คำนวณจากค่า defaultShift/defaultDayOff ของพนักงานแต่ละคน
 * (แทนที่ WEEKLY_SHIFTS แบบ hardcode เดิมที่ผูกกับชื่อ เชียง/มิ้ว/เจ ของ tenant #1 ตรงๆ)
 * พนักงานที่ไม่ได้ตั้งวันหยุดมาตรฐานไว้ (defaultDayOff = null) จะถือว่าทำงานทุกวันตามกะปกติ
 * — แอดมินปรับรายวันได้เสมอผ่าน "1-Click Day Switcher" อยู่แล้วไม่ว่ากรณีไหน */
function getDefaultDayShift(staff: RosterStaff[], dayOfWeek: number) {
  const morning: string[] = [];
  const late: string[] = [];
  const off: string[] = [];
  for (const emp of staff) {
    if (emp.defaultDayOff === dayOfWeek) off.push(emp.nickname);
    else if (emp.defaultShift === "late") late.push(emp.nickname);
    else morning.push(emp.nickname);
  }
  return { dayName: DAY_NAMES_THAI[dayOfWeek], morning, late, off };
}

const ATTENDANCE_OPTIONS: { value: StaffDailyStat["attendanceStatus"]; label: string; className: string }[] = [
  { value: "normal", label: "ปกติ", className: "bg-emerald-600 text-white border-emerald-600" },
  { value: "absent", label: "ขาด", className: "bg-rose-600 text-white border-rose-600" },
  { value: "leave", label: "ลา", className: "bg-amber-500 text-slate-950 border-amber-500" },
  { value: "late", label: "มาสาย", className: "bg-indigo-600 text-white border-indigo-600" },
];

/** ฟอร์มเล็กๆ บันทึกขาด/ลา/มาสาย + OT + จำนวนคู่ของพนักงานคนหนึ่งในวันหนึ่ง — ใช้ในหน้าต่าง
 * จัดการกะรายวัน (ลูกค้า LUXSU ขอมา — ดู CLAUDE.md) */
function DailyStatForm({
  employeeName,
  dateStr,
  existing,
  onSaved,
}: {
  employeeName: string;
  dateStr: string;
  existing?: StaffDailyStat;
  onSaved: (saved: StaffDailyStat) => void;
}) {
  const [status, setStatus] = useState<StaffDailyStat["attendanceStatus"]>(existing?.attendanceStatus ?? "normal");
  const [otHours, setOtHours] = useState<string>(existing?.otHours != null ? String(existing.otHours) : "");
  const [pairs, setPairs] = useState<string>(existing?.pairsHandled != null ? String(existing.pairsHandled) : "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await saveStaffDailyStat(employeeName, dateStr, {
        attendanceStatus: status,
        otHours: otHours.trim() ? Number(otHours) : null,
        pairsHandled: pairs.trim() ? Number(pairs) : null,
      });
      onSaved({
        id: existing?.id ?? 0,
        employeeName,
        statDate: dateStr,
        attendanceStatus: status,
        lateMinutes: existing?.lateMinutes ?? null,
        otHours: otHours.trim() ? Number(otHours) : null,
        pairsHandled: pairs.trim() ? Number(pairs) : null,
        note: existing?.note ?? null,
      });
      toast.success(`บันทึกข้อมูลวันนี้ของ ${employeeName} แล้ว`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg bg-white border border-slate-200 p-2 space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {ATTENDANCE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setStatus(opt.value)}
            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all ${
              status === opt.value ? opt.className : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1.5 items-center">
        <input
          type="number"
          inputMode="decimal"
          value={otHours}
          onChange={(e) => setOtHours(e.target.value)}
          placeholder="OT (ชม.)"
          className="rounded border border-slate-200 px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <input
          type="number"
          inputMode="numeric"
          value={pairs}
          onChange={(e) => setPairs(e.target.value)}
          placeholder="จำนวนคู่"
          className="rounded border border-slate-200 px-2 py-1 text-[10px] font-mono focus:outline-none focus:ring-1 focus:ring-teal-500"
        />
        <Button
          size="sm"
          disabled={saving}
          onClick={handleSave}
          className="h-7 text-[10px] bg-slate-800 hover:bg-slate-900 text-white font-bold"
        >
          {saving ? "..." : "💾 บันทึกวันนี้"}
        </Button>
      </div>
    </div>
  );
}

/** แถวตั้งค่ากะมาตรฐาน/วันหยุด/โบนัสต่อคู่ของพนักงานคนหนึ่ง ในหน้าต่าง "ตั้งค่าพนักงาน" */
function StaffDefaultsRow({ emp, onSaved }: { emp: RosterStaff; onSaved: (updated: RosterStaff) => void }) {
  const [defaultShift, setDefaultShift] = useState<"morning" | "late">(emp.defaultShift);
  const [defaultDayOff, setDefaultDayOff] = useState<string>(emp.defaultDayOff === null ? "" : String(emp.defaultDayOff));
  const [bonusPerPair, setBonusPerPair] = useState<string>(String(emp.bonusPerPair));
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const dayOff = defaultDayOff === "" ? null : Number(defaultDayOff);
      const bonus = Number(bonusPerPair) || 0;
      await updateEmployeeRosterDefaults(emp.id, { defaultShift, defaultDayOff: dayOff, bonusPerPair: bonus });
      onSaved({ ...emp, defaultShift, defaultDayOff: dayOff, bonusPerPair: bonus });
      toast.success(`บันทึกค่ากะมาตรฐานของ ${emp.nickname} แล้ว`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3 space-y-2">
      <div className="font-bold text-xs text-slate-900">{emp.nickname} <span className="font-normal text-slate-500">({emp.name})</span></div>
      <div className="grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
        <div>
          <label className="block text-slate-500 mb-0.5">กะปกติ</label>
          <select
            value={defaultShift}
            onChange={(e) => setDefaultShift(e.target.value as "morning" | "late")}
            className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
          >
            <option value="morning">☀️ เช้า</option>
            <option value="late">🌙 สาย</option>
          </select>
        </div>
        <div>
          <label className="block text-slate-500 mb-0.5">วันหยุดประจำ</label>
          <select
            value={defaultDayOff}
            onChange={(e) => setDefaultDayOff(e.target.value)}
            className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
          >
            <option value="">ไม่มี</option>
            {DAY_NAMES_THAI.map((d, i) => (
              <option key={i} value={i}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-slate-500 mb-0.5">โบนัส/คู่ (฿)</label>
          <input
            type="number"
            inputMode="decimal"
            value={bonusPerPair}
            onChange={(e) => setBonusPerPair(e.target.value)}
            className="w-full rounded border border-slate-200 px-1.5 py-1 text-[11px]"
          />
        </div>
      </div>
      <Button size="sm" disabled={saving} onClick={handleSave} className="h-7 w-full text-[11px] bg-teal-800 hover:bg-teal-900 text-white font-bold">
        {saving ? "กำลังบันทึก..." : "บันทึก"}
      </Button>
    </div>
  );
}

const MONTH_NAMES_THAI = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

export function RosterClient({
  initialStaff,
  shopHours,
  canGenerate,
}: {
  initialStaff: RosterStaff[];
  shopHours: { openTime: string; closeTime: string; branchName: string | null };
  canGenerate: boolean;
}) {
  // ⚠️ (แก้ 2026-09-02) เดิม hardcode เริ่มที่ "กันยายน 2569" ตรงๆ (currentYear=2026, currentMonth=8)
  // ตอนที่แก้ตรงกับเดือนปัจจุบันพอดีเลยยังไม่มีใครสังเกตว่าผิด แต่พอเข้าเดือนตุลาคมจะกลายเป็นบั๊ก
  // เดียวกับที่เจอใน /expenses และ /statistics ทันที (ค้างที่กันยายนตลอดกาล) แก้ให้เริ่มที่เดือน
  // ปัจจุบันจริงเสมอ
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth());
  const [selectedPresetId, setSelectedPresetId] = useState<string>("branch");
  const [customMorningTime, setCustomMorningTime] = useState<string>("08:30 - 17:30");
  const [customLateTime, setCustomLateTime] = useState<string>("11:30 - 20:30");
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);
  const [workersPerDay, setWorkersPerDay] = useState(() => Math.max(1, initialStaff.length - 1));
  const [generating, setGenerating] = useState(false);

  const holidays = useMemo(
    () => thaiPublicHolidaysRange(currentYear - 1, currentYear + 1),
    [currentYear]
  );
  const branchShifts = shiftsFromShopHours(shopHours.openTime, shopHours.closeTime);
  const shopHoursLabel = `${branchShifts.open} - ${branchShifts.close}`;

  // ✅ [multi-tenant 2026-09-17] พนักงานจริงของ tenant ตัวเอง (แทน EMPLOYEES ที่ hardcode เดิม)
  const [staff, setStaff] = useState<RosterStaff[]>(initialStaff);
  const [dailyStats, setDailyStats] = useState<StaffDailyStat[]>([]);
  const [isStaffSettingsOpen, setIsStaffSettingsOpen] = useState<boolean>(false);

  // โหลดบันทึกขาด/ลา/มาสาย/OT/จำนวนคู่ ของเดือนที่กำลังดูใหม่ทุกครั้งที่เปลี่ยนเดือน
  useEffect(() => {
    const ym = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    let cancelled = false;
    fetchStaffDailyStats(ym).then((rows) => {
      if (!cancelled) setDailyStats(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [currentYear, currentMonth]);

  // State to store custom day-by-day shift overrides (e.g. { "2026-09-15": { morning: [...], late: [...], off: [...] } })
  const [customDayOverrides, setCustomDayOverrides] = useState<
    Record<string, { morning: string[]; late: string[]; off: string[] }>
  >({});

  // Load custom overrides from localStorage on mount
  // localStorage อ่านตอน render ไม่ได้ (ไม่มีบนเซิร์ฟเวอร์ตอน SSR และจะทำให้ hydration ไม่ตรงกัน)
  // การอ่านหลัง mount แล้ว setState จึงเป็นวิธีที่ถูกต้องสำหรับค่าที่มีเฉพาะฝั่งเบราว์เซอร์
  // — รันครั้งเดียวตอน mount ([] ว่าง) ไม่ใช่ cascading render ที่ rule นี้ตั้งใจจะกัน
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sc_roster_custom_shifts");
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setCustomDayOverrides(JSON.parse(saved));
      }
    } catch {
      // Ignore JSON parse errors on invalid localStorage
    }
  }, []);

  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    dateStr: string;
    dayOfWeek: number;
    dayNum: number;
    holiday?: string;
    morning: string[];
    late: string[];
    off: string[];
    isCustomized?: boolean;
  } | null>(null);

  // Active shift times based on selected preset or custom input
  const currentShiftTimes = useMemo(() => {
    if (selectedPresetId === "branch") {
      return {
        morning: branchShifts.morning,
        late: branchShifts.late,
        name: `ตามเวลาสาขา (${shopHours.branchName || "ที่เลือก"})`,
        description: `ร้านเปิด ${shopHoursLabel} น.`,
      };
    }
    const preset = SHIFT_PRESETS.find((p) => p.id === selectedPresetId);
    if (preset) {
      return {
        morning: preset.morningTime,
        late: preset.lateTime,
        name: preset.name,
        description: preset.description,
      };
    }
    return {
      morning: customMorningTime,
      late: customLateTime,
      name: "กำหนดเวลาเอง (Custom)",
      description: `กะเช้า ${customMorningTime} น. · กะสาย ${customLateTime} น.`,
    };
  }, [selectedPresetId, customMorningTime, customLateTime, branchShifts.morning, branchShifts.late, shopHours.branchName, shopHoursLabel]);

  // Generate Calendar Days for Current Month (incorporating custom overrides)
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const numDays = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.

    const days = [];

    // Blank padding days before 1st of month
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push(null);
    }

    // Days in month
    for (let d = 1; d <= numDays; d++) {
      const dateObj = new Date(currentYear, currentMonth, d);
      const dayOfWeek = dateObj.getDay();
      const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const holiday = holidays[dateStr];
      const defaultShift = getDefaultDayShift(staff, dayOfWeek);
      const isCustomized = Boolean(customDayOverrides[dateStr]);
      const shift = customDayOverrides[dateStr] || defaultShift;

      days.push({
        dateStr,
        dayNum: d,
        dayOfWeek,
        holiday,
        morning: shift.morning,
        late: shift.late,
        off: shift.off,
        isCustomized,
      });
    }

    return days;
  }, [currentYear, currentMonth, customDayOverrides, staff, holidays]);

  // Helper to change an employee's shift on a specific date
  function setEmployeeShift(dateStr: string, empName: string, targetShift: "morning" | "late" | "off") {
    const dayObj = calendarDays.find((d) => d?.dateStr === dateStr);
    if (!dayObj) return;

    const newMorning = dayObj.morning.filter((name) => name !== empName);
    const newLate = dayObj.late.filter((name) => name !== empName);
    const newOff = dayObj.off.filter((name) => name !== empName);

    if (targetShift === "morning") {
      newMorning.push(empName);
    } else if (targetShift === "late") {
      newLate.push(empName);
    } else if (targetShift === "off") {
      newOff.push(empName);
    }

    const updatedShift = {
      morning: newMorning,
      late: newLate,
      off: newOff,
    };

    setCustomDayOverrides((prev) => {
      const next = { ...prev, [dateStr]: updatedShift };
      try {
        localStorage.setItem("sc_roster_custom_shifts", JSON.stringify(next));
      } catch {}
      return next;
    });

    setSelectedDayDetail((prev) => {
      if (!prev || prev.dateStr !== dateStr) return prev;
      return {
        ...prev,
        morning: newMorning,
        late: newLate,
        off: newOff,
        isCustomized: true,
      };
    });

    toast.success(`ปรับกะของ ${empName} วันที่ ${dateStr} เรียบร้อยแล้ว`);
  }

  // Reset a single day's shift override back to default weekly template
  function resetDayToDefault(dateStr: string, dayOfWeek: number) {
    setCustomDayOverrides((prev) => {
      const next = { ...prev };
      delete next[dateStr];
      try {
        localStorage.setItem("sc_roster_custom_shifts", JSON.stringify(next));
      } catch {}
      return next;
    });

    const defaultShift = getDefaultDayShift(staff, dayOfWeek);
    setSelectedDayDetail((prev) => {
      if (!prev || prev.dateStr !== dateStr) return prev;
      return {
        ...prev,
        morning: defaultShift.morning,
        late: defaultShift.late,
        off: defaultShift.off,
        isCustomized: false,
      };
    });

    toast.info(`คืนค่าตารางมาตรฐานของวันที่ ${dateStr} แล้ว`);
  }

  // Reset all custom overrides for the current month
  function resetMonthOverrides() {
    const prefix = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    setCustomDayOverrides((prev) => {
      const next: Record<string, { morning: string[]; late: string[]; off: string[] }> = {};
      Object.keys(prev).forEach((key) => {
        if (!key.startsWith(prefix)) {
          next[key] = prev[key];
        }
      });
      try {
        localStorage.setItem("sc_roster_custom_shifts", JSON.stringify(next));
      } catch {}
      return next;
    });
    toast.info(`รีเซ็ตตารางเดือน ${MONTH_NAMES_THAI[currentMonth]} เป็นค่ามาตรฐานทั้งหมดแล้ว`);
  }

  // Monthly stats for Jae (Daily Wage @ 350฿) & Chiang/Milk
  // ✅ [multi-tenant 2026-09-17] สรุปยอดเดือนนี้แบบทั่วไปต่อพนักงานทุกคน (แทน jae/chiang/milk
  // ที่ hardcode เดิม) — workDaysByEmployee มาจากตารางกะที่วางแผนไว้ (calendarDays) ส่วน
  // dailyStatsByEmployee มาจากบันทึกจริงที่แอดมินกรอก (sc_staff_daily_stats — ขาด/ลา/มาสาย/
  // OT/จำนวนคู่) เป็นคนละแหล่งข้อมูลกันโดยตั้งใจ (แผนงาน vs. สิ่งที่เกิดขึ้นจริง)
  const monthlyStats = useMemo(() => {
    let holidayCount = 0;
    const workDaysByEmployee: Record<string, number> = {};
    for (const emp of staff) workDaysByEmployee[emp.nickname] = 0;

    calendarDays.forEach((day) => {
      if (!day) return;
      if (day.holiday) holidayCount++;
      for (const emp of staff) {
        if (!day.off.includes(emp.nickname)) {
          workDaysByEmployee[emp.nickname] = (workDaysByEmployee[emp.nickname] ?? 0) + 1;
        }
      }
    });

    const dailyStatsByEmployee: Record<
      string,
      { absentDays: number; leaveDays: number; lateDays: number; totalOtHours: number; totalPairs: number }
    > = {};
    for (const s of dailyStats) {
      if (!dailyStatsByEmployee[s.employeeName]) {
        dailyStatsByEmployee[s.employeeName] = { absentDays: 0, leaveDays: 0, lateDays: 0, totalOtHours: 0, totalPairs: 0 };
      }
      const row = dailyStatsByEmployee[s.employeeName];
      if (s.attendanceStatus === "absent") row.absentDays += 1;
      else if (s.attendanceStatus === "leave") row.leaveDays += 1;
      else if (s.attendanceStatus === "late") row.lateDays += 1;
      row.totalOtHours += Number(s.otHours ?? 0);
      row.totalPairs += Number(s.pairsHandled ?? 0);
    }

    return { workDaysByEmployee, holidayCount, dailyStatsByEmployee };
  }, [calendarDays, staff, dailyStats]);

  function handlePrevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  }

  function handleNextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  }

  function handlePrint() {
    window.print();
  }

  function exportRosterToExcel() {
    // 1. Employee Payroll & Rule Summary Sheet
    const staffSummaryData = staff.map((emp) => {
      const isDaily = emp.employmentType === "probation_daily";
      const workDays = monthlyStats.workDaysByEmployee[emp.nickname] ?? 0;
      const s = monthlyStats.dailyStatsByEmployee[emp.nickname];
      return {
        "รหัส/ชื่อเล่น": emp.nickname,
        "ชื่อ-นามสกุล (พนักงาน)": emp.name,
        "ตำแหน่ง": emp.position,
        "ประเภทสัญญา": isDaily ? "พนักงานทดลองงาน" : "พนักงานประจำ",
        "อัตราค่าจ้าง": isDaily ? `วันละ ${emp.wage.toLocaleString()} บาท` : `เงินเดือนประจำ (${emp.wage.toLocaleString()} ฿)`,
        "วันหยุดประจำสัปดาห์": emp.defaultDayOff !== null ? DAY_NAMES_THAI[emp.defaultDayOff] : "ยังไม่ได้ตั้งค่า",
        "วันทำงานในเดือนนี้": isDaily ? `${workDays} วัน` : "26 วัน (โดยประมาณ)",
        "ประมาณการเงินเดือน/ค่าจ้าง": isDaily ? workDays * emp.wage : emp.wage,
        "ขาด/ลา/มาสาย (บันทึกจริง)": s ? `ขาด ${s.absentDays} · ลา ${s.leaveDays} · สาย ${s.lateDays}` : "-",
        "OT รวม (ชม.)": s?.totalOtHours ?? 0,
        "จำนวนคู่รวม": s?.totalPairs ?? 0,
        "โบนัสจากจำนวนคู่ (บาท)": Math.round((s?.totalPairs ?? 0) * emp.bonusPerPair),
      };
    });

    // 2. Daily Schedule Matrix Sheet
    const dailyScheduleData = calendarDays
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .map((d) => ({
      "วันที่": d.dateStr,
      "วัน": DAY_NAMES_THAI[d.dayOfWeek] || "",
      [`กะเช้า (${currentShiftTimes.morning})`]: d.morning.join(", "),
      [`กะสาย (${currentShiftTimes.late})`]: d.late.join(", "),
      "วันหยุด": d.off.join(", ") || "ไม่มี",
      "หมายเหตุวันหยุดแรงงาน": d.holiday || "",
    }));

    const wb = XLSX.utils.book_new();
    const wsStaff = XLSX.utils.json_to_sheet(staffSummaryData);
    const wsSchedule = XLSX.utils.json_to_sheet(dailyScheduleData);

    XLSX.utils.book_append_sheet(wb, wsStaff, "สรุปพนักงานและเงินเดือน");
    XLSX.utils.book_append_sheet(wb, wsSchedule, `ตารางกะ_${MONTH_NAMES_THAI[currentMonth]}`);

    const fileName = `DD-Management_Roster_${MONTH_NAMES_THAI[currentMonth]}_${currentYear + 543}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`ดาวน์โหลดไฟล์ ${fileName} เรียบร้อยแล้ว`);
  }

  async function handleAutoGenerate() {
    if (staff.length === 0) {
      toast.error("ยังไม่มีพนักงาน — เพิ่มที่หน้าค่าใช้จ่ายก่อน");
      return;
    }
    setGenerating(true);
    try {
      const plan = generateRosterPlan(staff.length, workersPerDay);
      await applyGeneratedDayOffs(
        staff.map((emp, i) => ({ employeeId: emp.id, dayOff: plan.dayOffs[i] ?? 0 }))
      );
      setStaff(staff.map((emp, i) => ({ ...emp, defaultDayOff: plan.dayOffs[i] ?? 0 })));
      if (plan.warnings.length > 0) {
        toast.warning(
          `จัดเวรแล้ว แต่มี ${plan.warnings.length} วันที่คนอยู่ร้านน้อยกว่า ${workersPerDay} คน — ปรับวันหยุดรายคนได้ที่ตั้งค่า`
        );
      } else {
        toast.success("จัดวันหยุดประจำสัปดาห์อัตโนมัติแล้ว — วันนักขัตฤกษ์ยังมาจากปฏิทินกลาง");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "จัดเวรไม่สำเร็จ");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-5 print:p-0">
      <PageHeader
        className="print:hidden"
        title="ตารางการทำงาน"
        description={
          shopHours.branchName
            ? `เวลาเปิดร้านสาขา ${shopHours.branchName}: ${shopHoursLabel} น. · วันนักขัตฤกษ์ดึงจากปฏิทินกลาง ไม่ดึงตารางของสาขาแรก`
            : `เลือกสาขาที่หัวเว็บเพื่อใช้เวลาเปิด-ปิดของสาขานั้น (ค่าเริ่มต้น ${shopHoursLabel} น.)`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportRosterToExcel} className="text-xs gap-1.5">
              <Download className="h-4 w-4" /> Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="text-xs gap-1.5">
              <Printer className="h-4 w-4" /> พิมพ์ A4
            </Button>
          </div>
        }
      />

      {/* ── Shift Preset Selector Bar (Hidden on Print) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs print:hidden space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-teal-700" />
            <span className="text-sm font-bold text-slate-900">รูปแบบเวลาเข้า-ออกงาน (Shift Timing):</span>
            <Badge variant="outline" className="text-xs font-mono font-semibold text-teal-800 bg-teal-50 border-teal-200">
              ร้านเปิด {shopHoursLabel} น.
            </Badge>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCustomModalOpen(true)}
            className="h-7 text-xs text-slate-600 font-semibold hover:text-teal-700"
          >
            ⚙️ กำหนดเวลาเอง
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setSelectedPresetId("branch")}
            className={`flex flex-col text-left rounded-xl p-3 border transition-all ${
              selectedPresetId === "branch"
                ? "bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-2xs"
                : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 hover:border-slate-300"
            }`}
          >
            <span className={`text-xs font-bold ${selectedPresetId === "branch" ? "text-teal-900" : "text-slate-800"}`}>
              ตามเวลาสาขานี้{shopHours.branchName ? ` (${shopHours.branchName})` : ""}
            </span>
            <div className="mt-1.5 text-[11px] font-medium text-slate-600 flex flex-wrap items-center gap-2">
              <span className="text-emerald-700 font-bold">เช้า {branchShifts.morning}</span>
              <span className="text-indigo-800 font-bold">สาย {branchShifts.late}</span>
            </div>
          </button>
          {SHIFT_PRESETS.map((preset) => {
            const isSelected = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPresetId(preset.id)}
                className={`flex flex-col text-left rounded-xl p-3 border transition-all ${
                  isSelected
                    ? "bg-teal-50/70 border-teal-500 ring-2 ring-teal-500/20 shadow-2xs"
                    : "bg-slate-50/50 border-slate-200 hover:bg-slate-100/70 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-xs font-bold ${isSelected ? "text-teal-900" : "text-slate-800"}`}>
                    {preset.name}
                  </span>
                  {isSelected && (
                    <span className="flex h-2 w-2 rounded-full bg-teal-600" />
                  )}
                </div>
                <div className="mt-1.5 text-[11px] font-medium text-slate-600 flex items-center gap-2">
                  <span className="text-emerald-700 font-bold">เช้า {preset.morningTime}</span>
                  <span className="text-slate-300">|</span>
                  <span className="text-indigo-800 font-bold">สาย {preset.lateTime}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Employee Shift Rules Summary Cards ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <h3 className="text-sm font-semibold text-slate-900">พนักงาน ({staff.length} คน)</h3>
        <div className="flex flex-wrap items-center gap-2">
          {canGenerate && staff.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
              <label className="text-[11px] text-slate-500 whitespace-nowrap">คนอยู่ร้าน/วัน</label>
              <input
                type="number"
                min={1}
                max={Math.max(1, staff.length)}
                value={workersPerDay}
                onChange={(e) => setWorkersPerDay(Math.max(1, Number(e.target.value) || 1))}
                className="h-7 w-12 rounded border border-slate-200 px-1 text-center text-xs"
              />
              <Button
                size="sm"
                disabled={generating}
                onClick={handleAutoGenerate}
                className="h-7 text-[11px]"
              >
                {generating ? "กำลังจัด..." : "จัดเวรอัตโนมัติ"}
              </Button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsStaffSettingsOpen(true)}
            className="h-7 text-xs font-semibold text-slate-600 hover:text-teal-700"
          >
            ตั้งค่ากะ/วันหยุด
          </Button>
        </div>
      </div>
      {staff.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-xs text-slate-500 print:hidden">
          ยังไม่มีพนักงานในระบบ — เพิ่มพนักงานได้ที่หน้า{" "}
          <a href="/expenses" className="font-bold text-teal-700 underline">
            /expenses
          </a>{" "}
          ก่อน แล้วกลับมาตั้งค่ากะที่นี่
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3 print:hidden">
        {staff.map((emp) => {
          const isDaily = emp.employmentType === "probation_daily";
          const workDays = monthlyStats.workDaysByEmployee[emp.nickname] ?? 0;
          const s = monthlyStats.dailyStatsByEmployee[emp.nickname];
          const pairBonus = Math.round((s?.totalPairs ?? 0) * emp.bonusPerPair);
          return (
            <Card key={emp.id} className="border-slate-200 shadow-2xs overflow-hidden">
              <CardHeader className="p-4 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-teal-700" />
                    {emp.nickname}
                  </CardTitle>
                  <Badge
                    className={
                      !isDaily
                        ? "bg-emerald-500 text-white font-semibold text-[10px]"
                        : "bg-amber-500 text-slate-950 font-bold text-[10px]"
                    }
                  >
                    {!isDaily ? "พนักงานประจำ" : `ทดลองงาน ${emp.wage.toLocaleString()}฿/วัน`}
                  </Badge>
                </div>
                <CardDescription className="text-xs text-slate-500">{emp.name} · {emp.position}</CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-100">
                  <span className="text-slate-500">วันหยุดประจำตัว:</span>
                  <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                    {emp.defaultDayOff !== null ? `❌ หยุด${DAY_NAMES_THAI[emp.defaultDayOff]}` : "ยังไม่ได้ตั้งค่า"}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">วันทำงานเดือนนี้:</span>
                  <span className="font-semibold text-slate-700">{workDays} วัน</span>
                </div>
                {isDaily && (
                  <div className="rounded-lg bg-amber-50 p-2 border border-amber-200/80 text-[11px] text-amber-900 font-medium">
                    💡 เดือนนี้ทำงาน {workDays} วัน = ประมาณการค่าจ้าง ฿{(workDays * emp.wage).toLocaleString()} บาท
                  </div>
                )}
                {s && (s.absentDays > 0 || s.leaveDays > 0 || s.lateDays > 0) && (
                  <div className="rounded-lg bg-rose-50 p-2 border border-rose-200/80 text-[11px] text-rose-900 font-medium">
                    📋 ขาด {s.absentDays} · ลา {s.leaveDays} · มาสาย {s.lateDays} ครั้ง (จากบันทึกจริง)
                  </div>
                )}
                {emp.bonusPerPair > 0 && (
                  <div className="rounded-lg bg-teal-50 p-2 border border-teal-200/80 text-[11px] text-teal-900 font-medium">
                    👟 ทำแล้ว {s?.totalPairs ?? 0} คู่ × {emp.bonusPerPair}฿ = โบนัส ฿{pairBonus.toLocaleString()}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Month Selector & Calendar Header ── */}
      <Card className="printable-area border-slate-200 shadow-sm">
        <CardHeader className="p-4 bg-slate-50 border-b border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-teal-800 p-2 text-white">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  ตารางงานประจำเดือน {MONTH_NAMES_THAI[currentMonth]} {currentYear + 543}
                </h3>
                <p className="text-xs text-slate-500">
                  [กะเช้า: {currentShiftTimes.morning} น.] · [กะสาย: {currentShiftTimes.late} น.] (ร้านเปิด {shopHoursLabel} น.)
                </p>
              </div>
            </div>

            {/* Prev / Next Month Controls (Hidden on Print) */}
            <div className="flex items-center gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevMonth}
                className="h-8 gap-1 text-xs font-semibold"
              >
                <ChevronLeft className="h-4 w-4" /> เดือนก่อนหน้า
              </Button>
              <div className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold border border-slate-200 font-mono">
                {MONTH_NAMES_THAI[currentMonth]} {currentYear + 543}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextMonth}
                className="h-8 gap-1 text-xs font-semibold"
              >
                เดือนถัดไป <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>

        {/* ── Monthly Calendar Grid ── */}
        <CardContent className="p-3 sm:p-4">
          <div className="hidden sm:block print:block">
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-slate-700 pb-2 border-b border-slate-200">
            {["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"].map((short, dow) => {
              const offNames = staff.filter((e) => e.defaultDayOff === dow).map((e) => e.nickname);
              return (
                <div
                  key={short}
                  className={`p-2 rounded-lg ${offNames.length > 0 ? "text-rose-600 bg-rose-50/50" : "bg-slate-50"}`}
                >
                  {short}
                  {offNames.length > 0 && <span className="block text-[9px] font-normal">({offNames.join(", ")} OFF)</span>}
                </div>
              );
            })}
          </div>

          {/* Days Cells */}
          <div className="grid grid-cols-7 gap-1.5 pt-2">
            {calendarDays.map((day, idx) => {
              if (!day) {
                return (
                  <div
                    key={`blank-${idx}`}
                    className="min-h-[100px] rounded-xl bg-slate-50/40 border border-dashed border-slate-100 p-2"
                  />
                );
              }

              const isHoliday = !!day.holiday;

              return (
                <div
                  key={day.dateStr}
                  onClick={() => setSelectedDayDetail(day)}
                  className={`min-h-[110px] rounded-xl border p-2 text-xs flex flex-col justify-between transition-all cursor-pointer hover:shadow-md ${
                    isHoliday
                      ? "bg-rose-50/70 border-rose-300 ring-1 ring-rose-300"
                      : day.isCustomized
                      ? "bg-teal-50/40 border-teal-400 ring-1 ring-teal-300/50"
                      : day.dayOfWeek === 0
                      ? "bg-amber-50/20 border-slate-200"
                      : "bg-white border-slate-200 hover:border-teal-400"
                  }`}
                >
                  {/* Day Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-mono text-sm font-black ${
                            isHoliday
                              ? "text-rose-700"
                              : day.dayOfWeek === 0
                              ? "text-rose-600"
                              : "text-slate-800"
                          }`}
                        >
                          {day.dayNum}
                        </span>
                        {day.isCustomized && (
                          <span className="text-[9px] font-bold text-teal-700 bg-teal-100 px-1 py-0.2 rounded">
                            ✏️ ปรับแล้ว
                          </span>
                        )}
                      </div>
                      {isHoliday && (
                        <Badge className="bg-rose-600 text-white font-bold text-[9px] px-1 py-0 h-4">
                          วันหยุดแรงงาน
                        </Badge>
                      )}
                    </div>

                    {/* Holiday Title Note */}
                    {isHoliday && (
                      <div className="text-[10px] font-bold text-rose-800 leading-tight pt-1 pb-1">
                        ★ {day.holiday}
                      </div>
                    )}

                    {/* Shifts Breakdown */}
                    <div className="space-y-1 pt-1.5">
                      {/* Morning Shift */}
                      <div className="flex items-start gap-1 text-[10px] text-slate-700">
                        <Sun className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          เช้า ({currentShiftTimes.morning.split(" - ")[0]}): {day.morning.length > 0 ? day.morning.join(", ") : "-"}
                        </span>
                      </div>

                      {/* Late Shift */}
                      <div className="flex items-start gap-1 text-[10px] text-slate-700">
                        <Sunset className="h-3 w-3 text-indigo-500 shrink-0 mt-0.5" />
                        <span className="font-semibold text-indigo-800">
                          สาย ({currentShiftTimes.late.split(" - ")[0]}): {day.late.length > 0 ? day.late.join(", ") : "-"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Off Badge at Bottom */}
                  {day.off.length > 0 && (
                    <div className="pt-1">
                      <span className="inline-block w-full text-center rounded bg-slate-100 text-[10px] font-bold text-slate-500 py-0.5 border border-slate-200">
                        ❌ {day.off.join(", ")} หยุด
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>

          <div className="space-y-2 print:hidden sm:hidden">
            {calendarDays
              .filter((day): day is NonNullable<typeof day> => day !== null)
              .map((day) => (
                <button
                  key={day.dateStr}
                  type="button"
                  onClick={() => setSelectedDayDetail(day)}
                  className={`w-full rounded-xl border p-3 text-left text-xs space-y-1 ${
                    day.holiday
                      ? "border-rose-300 bg-rose-50"
                      : day.isCustomized
                      ? "border-teal-300 bg-teal-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">
                      {day.dayNum} {DAY_NAMES_THAI[day.dayOfWeek]}
                    </span>
                    {day.holiday ? (
                      <span className="text-[10px] font-semibold text-rose-700">{day.holiday}</span>
                    ) : null}
                  </div>
                  <div className="text-emerald-700">เช้า: {day.morning.join(", ") || "—"}</div>
                  <div className="text-indigo-800">สาย: {day.late.join(", ") || "—"}</div>
                  <div className="text-slate-500">หยุด: {day.off.join(", ") || "—"}</div>
                </button>
              ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100 print:hidden">
            <span className="flex items-center gap-1.5">
              💡 <strong>วิธีใช้งาน:</strong> สามารถคลิกที่วันใดก็ได้บนปฏิทิน เพื่อสลับกะหรือเปลี่ยนวันหยุดพนักงานได้ทันที
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetMonthOverrides}
              className="h-6 text-[11px] text-slate-400 hover:text-rose-600 font-medium"
            >
              🔄 รีเซ็ตตารางเดือนนี้เป็นค่ามาตรฐาน
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Thai Labor Law & Shop Notice Footer ── */}
      <div className="rounded-2xl bg-teal-900 p-6 text-white space-y-3 print:bg-white print:text-slate-900 print:border print:border-slate-300">
        <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
          <Info className="h-4 w-4" /> หมายเหตุและแนวทางปฏิบัติตามกฎหมายแรงงานไทย (DD-Management Shop Policy)
        </div>
        <ul className="text-xs text-teal-100 space-y-1.5 list-disc list-inside print:text-slate-700">
          <li>
            <strong>เวลาทำการร้าน:</strong> {shopHoursLabel} น.{shopHours.branchName ? ` (สาขา ${shopHours.branchName})` : ""} โดยจัดกะทำงาน 2 กะ (เช้า {currentShiftTimes.morning} น. และ สาย {currentShiftTimes.late} น.) ชั่วโมงทำงานมาตรฐาน 8 ชั่วโมง/วัน (พัก 1 ชั่วโมง)
          </li>
          <li>
            <strong>วันหยุดประจำสัปดาห์ (1 วัน/สัปดาห์):</strong> พนักงานทุกคนมีวันหยุดประจำสัปดาห์คนละ 1 วันแน่นอนตามตาราง
            {staff.filter((e) => e.defaultDayOff !== null).length > 0 && (
              <> ({staff.filter((e) => e.defaultDayOff !== null).map((e) => `${e.nickname}: ${DAY_NAMES_THAI[e.defaultDayOff as number]}`).join(", ")})</>
            )}
          </li>
          <li>
            <strong>วันหยุดตามประเพณี / นักขัตฤกษ์:</strong> ตาม พ.ร.บ. คุ้มครองแรงงาน นายจ้างต้องกำหนดวันหยุดตามประเพณีไม่น้อยกว่า 13 วัน/ปี หากพนักงานมาปฏิบัติงานในวันหยุดนักขัตฤกษ์ จะได้รับค่าตอบแทนทำงานในวันหยุด (Holiday Pay) หรือได้รับสิทธิ์หยุดชดเชยตามตกลง
          </li>
          <li>
            <strong>พนักงานทดลองงาน:</strong> คำนวณค่าจ้างตามจำนวนวันที่มาปฏิบัติงานจริงในแต่ละเดือน สามารถบันทึกขาด/ลา/มาสาย, ค่าล่วงเวลา (OT) และจำนวนคู่รองเท้าที่ทำต่อวันได้ที่ปุ่ม &ldquo;บันทึกวันนี้&rdquo; ในหน้าต่างจัดการกะรายวัน
          </li>
        </ul>
      </div>

      {/* ── Custom Shift Time Modal ── */}
      {isCustomModalOpen && (
        <ModalBackdrop
          onClose={() => setIsCustomModalOpen(false)}
          dismissOnBackdrop={false}
          className="bg-slate-950/60 backdrop-blur-xs print:hidden"
        >
          <div className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-teal-700" />
                กำหนดเวลาเข้า-ออกงานเอง (Custom Shift)
              </h4>
              <button
                onClick={() => setIsCustomModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">เวลากะเช้า (Morning Shift):</label>
                <input
                  type="text"
                  value={customMorningTime}
                  onChange={(e) => setCustomMorningTime(e.target.value)}
                  placeholder="เช่น 08:30 - 17:30"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">เวลากะสาย / ปิดร้าน (Late Shift):</label>
                <input
                  type="text"
                  value={customLateTime}
                  onChange={(e) => setCustomLateTime(e.target.value)}
                  placeholder="เช่น 11:30 - 20:30"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsCustomModalOpen(false)}
                className="text-xs"
              >
                ยกเลิก
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setSelectedPresetId("custom");
                  setIsCustomModalOpen(false);
                  toast.success("บันทึกเวลาเข้า-ออกงานเรียบร้อยแล้ว");
                }}
                className="bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs"
              >
                นำไปใช้ในตาราง
              </Button>
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ── Staff Settings Modal: กะปกติ / วันหยุดประจำ / โบนัสต่อคู่ ── */}
      {isStaffSettingsOpen && (
        <ModalBackdrop
          onClose={() => setIsStaffSettingsOpen(false)}
          className="bg-slate-950/60 backdrop-blur-xs print:hidden"
        >
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-teal-700" />
                ตั้งค่ากะ/วันหยุด/โบนัสต่อคู่ ของพนักงาน
              </h4>
              <button
                onClick={() => setIsStaffSettingsOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              ตั้งค่าเหล่านี้เป็นค่าเริ่มต้นของตารางกะรายสัปดาห์ — ปรับรายวันได้เสมอด้วยการคลิกที่วันนั้นบนปฏิทิน
              โบนัสต่อคู่ตั้งเป็น 0 = ปิดใช้งาน (ไม่มีผลต่อยอดเงินเดือน)
            </p>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {staff.map((emp) => (
                <StaffDefaultsRow
                  key={emp.id}
                  emp={emp}
                  onSaved={(updated) => setStaff((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))}
                />
              ))}
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* ── Interactive Day Detail & Shift Switcher Modal ── */}
      {selectedDayDetail && (
        <ModalBackdrop
          onClose={() => setSelectedDayDetail(null)}
          className="bg-slate-950/60 backdrop-blur-xs print:hidden"
        >
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4 text-teal-700" />
                  จัดการกะวันที่ {selectedDayDetail.dayNum} {MONTH_NAMES_THAI[currentMonth]} {currentYear + 543}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  แตะเลือกปุ่มกะที่ต้องการเพื่อเปลี่ยนกะพนักงานในวันนี้ได้ทันที
                </p>
              </div>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            {selectedDayDetail.holiday && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 text-xs text-rose-900 font-bold flex items-center gap-2">
                <span>★</span> วันหยุดนักขัตฤกษ์: {selectedDayDetail.holiday}
              </div>
            )}

            {/* Employee 1-Click Shift Controls + บันทึกขาด/ลา/มาสาย/OT/จำนวนคู่รายวัน */}
            <div className="space-y-3">
              {staff.map((emp) => {
                const isMorning = selectedDayDetail.morning.includes(emp.nickname);
                const isLate = selectedDayDetail.late.includes(emp.nickname);
                const isOff = selectedDayDetail.off.includes(emp.nickname);
                const existing = dailyStats.find(
                  (s) => s.employeeName === emp.nickname && s.statDate === selectedDayDetail.dateStr
                );

                return (
                  <div
                    key={emp.id}
                    className="rounded-xl border border-slate-200 p-3 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{emp.nickname}</span>
                        <span className="text-[11px] text-slate-500">({emp.position})</span>
                      </div>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700">
                        {isMorning
                          ? `☀️ กะเช้า (${currentShiftTimes.morning})`
                          : isLate
                          ? `🌙 กะสาย (${currentShiftTimes.late})`
                          : `🏖️ หยุด (OFF)`}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEmployeeShift(selectedDayDetail.dateStr, emp.nickname, "morning")}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 border ${
                          isMorning
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs ring-2 ring-emerald-600/20"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700"
                        }`}
                      >
                        <Sun className="h-3.5 w-3.5" /> กะเช้า
                      </button>

                      <button
                        type="button"
                        onClick={() => setEmployeeShift(selectedDayDetail.dateStr, emp.nickname, "late")}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 border ${
                          isLate
                            ? "bg-indigo-700 text-white border-indigo-700 shadow-xs ring-2 ring-indigo-700/20"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:text-indigo-700"
                        }`}
                      >
                        <Sunset className="h-3.5 w-3.5" /> กะสาย
                      </button>

                      <button
                        type="button"
                        onClick={() => setEmployeeShift(selectedDayDetail.dateStr, emp.nickname, "off")}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 border ${
                          isOff
                            ? "bg-rose-600 text-white border-rose-600 shadow-xs ring-2 ring-rose-600/20"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700"
                        }`}
                      >
                        ❌ วันหยุด
                      </button>
                    </div>

                    {/* บันทึกขาด/ลา/มาสาย + OT + จำนวนคู่ของวันนี้ */}
                    <DailyStatForm
                      employeeName={emp.nickname}
                      dateStr={selectedDayDetail.dateStr}
                      existing={existing}
                      onSaved={(saved) => {
                        setDailyStats((prev) => [
                          ...prev.filter((s) => !(s.employeeName === emp.nickname && s.statDate === selectedDayDetail.dateStr)),
                          saved,
                        ]);
                      }}
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {selectedDayDetail.isCustomized ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resetDayToDefault(selectedDayDetail.dateStr, selectedDayDetail.dayOfWeek)}
                  className="text-xs text-rose-600 hover:bg-rose-50 border-rose-200 font-semibold"
                >
                  🔄 คืนค่ามาตรฐานของวันนี้
                </Button>
              ) : (
                <span className="text-[11px] text-slate-400">ตารางมาตรฐานประจำสัปดาห์</span>
              )}

              <Button
                onClick={() => setSelectedDayDetail(null)}
                className="bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs"
              >
                บันทึก & ปิด
              </Button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}

