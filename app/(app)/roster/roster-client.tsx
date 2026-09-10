"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import * as XLSX from "xlsx";
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

// Official Thai Public & Labor Holidays (2026-09 to 2027-08)
const THAI_LABOR_HOLIDAYS: Record<string, string> = {
  "2026-09-24": "วันมหิดล",
  "2026-10-13": "วันนวมินทรมหาราช",
  "2026-10-23": "วันปิยมหาราช",
  "2026-12-05": "วันคล้ายวันพระบรมราชสมภพ ร.9 / วันพ่อแห่งชาติ",
  "2026-12-10": "วันรัฐธรรมนูญ",
  "2026-12-31": "วันสิ้นปี",
  "2027-01-01": "วันขึ้นปีใหม่",
  "2027-04-13": "วันสงกรานต์",
  "2027-04-14": "วันสงกรานต์",
  "2027-04-15": "วันสงกรานต์",
  "2027-05-01": "วันแรงงานแห่งชาติ (พ.ร.บ. คุ้มครองแรงงาน)",
  "2027-05-04": "วันฉัตรมงคล",
  "2027-07-28": "วันเฉลิมพระชนมพรรษา ร.10",
  "2027-08-12": "วันแม่แห่งชาติ / วันเฉลิมพระชนมพรรษา พระพันปีหลวง",
};

type EmployeeInfo = {
  id: string;
  name: string;
  type: "monthly" | "daily";
  role: string;
  wageNote: string;
  offDay: number; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  offDayName: string;
  color: string;
};

const EMPLOYEES: EmployeeInfo[] = [
  {
    id: "chiang",
    name: "เชียง (นายธีรภัทร ทาแผ)",
    type: "monthly",
    role: "พนักงานประจำ / ช่างหลัก",
    wageNote: "เงินเดือนประจำ (12,000 ฿)",
    offDay: 3, // Wed
    offDayName: "วันพุธ",
    color: "bg-emerald-500 text-white",
  },
  {
    id: "milk",
    name: "มิ้ว (น.ส.สุทธินันท์ นนทจันทร์)",
    type: "monthly",
    role: "พนักงานประจำ / ผู้จัดการหน้าร้าน",
    wageNote: "เงินเดือนประจำ (12,000 ฿)",
    offDay: 0, // Sun
    offDayName: "วันอาทิตย์",
    color: "bg-indigo-700 text-white",
  },
  {
    id: "jae",
    name: "เจ (พนักงานทดลองงาน)",
    type: "daily",
    role: "ช่างสปารองเท้า (ทดลองงาน)",
    wageNote: "วันละ 350 บาท (คำนวณตามวันทำจริง)",
    offDay: 5, // Fri
    offDayName: "วันศุกร์",
    color: "bg-amber-600 text-white",
  },
];

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

// Weekly Shift Template (Day of week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
const WEEKLY_SHIFTS: Record<
  number,
  {
    dayName: string;
    morning: string[];
    late: string[];
    off: string[];
  }
> = {
  1: {
    dayName: "วันจันทร์",
    morning: ["เชียง", "มิ้ว"],
    late: ["เจ"],
    off: [],
  },
  2: {
    dayName: "วันอังคาร",
    morning: ["เชียง", "เจ"],
    late: ["มิ้ว"],
    off: [],
  },
  3: {
    dayName: "วันพุธ",
    morning: ["มิ้ว"],
    late: ["เจ"],
    off: ["เชียง"],
  },
  4: {
    dayName: "วันพฤหัสบดี",
    morning: ["เชียง", "เจ"],
    late: ["มิ้ว"],
    off: [],
  },
  5: {
    dayName: "วันศุกร์",
    morning: ["เชียง"],
    late: ["มิ้ว"],
    off: ["เจ"],
  },
  6: {
    dayName: "วันเสาร์",
    morning: ["เชียง", "เจ"],
    late: ["มิ้ว"],
    off: [],
  },
  0: {
    dayName: "วันอาทิตย์",
    morning: ["เชียง"],
    late: ["เจ"],
    off: ["มิ้ว"],
  },
};

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

export function RosterClient() {
  // ⚠️ (แก้ 2026-09-02) เดิม hardcode เริ่มที่ "กันยายน 2569" ตรงๆ (currentYear=2026, currentMonth=8)
  // ตอนที่แก้ตรงกับเดือนปัจจุบันพอดีเลยยังไม่มีใครสังเกตว่าผิด แต่พอเข้าเดือนตุลาคมจะกลายเป็นบั๊ก
  // เดียวกับที่เจอใน /expenses และ /statistics ทันที (ค้างที่กันยายนตลอดกาล) แก้ให้เริ่มที่เดือน
  // ปัจจุบันจริงเสมอ
  const [currentYear, setCurrentYear] = useState<number>(() => new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(() => new Date().getMonth());
  const [selectedPresetId, setSelectedPresetId] = useState<string>("prep_close");
  const [customMorningTime, setCustomMorningTime] = useState<string>("08:30 - 17:30");
  const [customLateTime, setCustomLateTime] = useState<string>("11:30 - 20:30");
  const [isCustomModalOpen, setIsCustomModalOpen] = useState<boolean>(false);

  // State to store custom day-by-day shift overrides (e.g. { "2026-09-15": { morning: [...], late: [...], off: [...] } })
  const [customDayOverrides, setCustomDayOverrides] = useState<
    Record<string, { morning: string[]; late: string[]; off: string[] }>
  >({});

  // Load custom overrides from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sc_roster_custom_shifts");
      if (saved) {
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
  }, [selectedPresetId, customMorningTime, customLateTime]);

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
      const holiday = THAI_LABOR_HOLIDAYS[dateStr];
      const defaultShift = WEEKLY_SHIFTS[dayOfWeek];
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
  }, [currentYear, currentMonth, customDayOverrides]);

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

    const defaultShift = WEEKLY_SHIFTS[dayOfWeek];
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
  const monthlyStats = useMemo(() => {
    let jaeWorkDays = 0;
    let chiangWorkDays = 0;
    let milkWorkDays = 0;
    let holidayCount = 0;

    calendarDays.forEach((day) => {
      if (!day) return;
      if (day.holiday) holidayCount++;

      if (!day.off.includes("เจ")) jaeWorkDays++;
      if (!day.off.includes("เชียง")) chiangWorkDays++;
      if (!day.off.includes("มิ้ว")) milkWorkDays++;
    });

    const jaeEstimatedWage = jaeWorkDays * 350;

    return {
      jaeWorkDays,
      jaeEstimatedWage,
      chiangWorkDays,
      milkWorkDays,
      holidayCount,
    };
  }, [calendarDays]);

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
    const staffSummaryData = EMPLOYEES.map((emp) => {
      const isJae = emp.id === "jae";
      return {
        "รหัส/ชื่อเล่น": emp.id,
        "ชื่อ-นามสกุล (พนักงาน)": emp.name,
        "ตำแหน่ง": emp.role,
        "ประเภทสัญญา": emp.type === "monthly" ? "พนักงานประจำ" : "พนักงานทดลองงาน",
        "อัตราค่าจ้าง": emp.wageNote,
        "วันหยุดประจำสัปดาห์": emp.offDayName,
        "วันทำงานในเดือนนี้": isJae ? `${monthlyStats.jaeWorkDays} วัน` : "26 วัน (โดยประมาณ)",
        "ประมาณการเงินเดือน/ค่าจ้าง": isJae ? monthlyStats.jaeEstimatedWage : 12000,
      };
    });

    // 2. Daily Schedule Matrix Sheet
    const dailyScheduleData = calendarDays
      .filter((d): d is NonNullable<typeof d> => d !== null)
      .map((d) => ({
      "วันที่": d.dateStr,
      "วัน": WEEKLY_SHIFTS[d.dayOfWeek]?.dayName || "",
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

    const fileName = `SneakerCare_Roster_${MONTH_NAMES_THAI[currentMonth]}_${currentYear + 543}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.success(`ดาวน์โหลดไฟล์ ${fileName} เรียบร้อยแล้ว`);
  }

  return (
    <div className="space-y-8 print:p-0">
      {/* ── Page Banner (Hidden on Print) ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-900 via-slate-800 to-slate-900 p-6 text-white shadow-md print:hidden">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <CalendarIcon className="h-3.5 w-3.5" />
            SneakerCare Smart Roster System (เวลาเปิดร้าน 09:00 - 20:00 น.)
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ตารางการทำงาน & ปฏิทินกะพนักงาน</h2>
          <p className="text-sm text-teal-100/80">
            ระบบจัดตารางกะรายวัน, กำหนดเวลาเข้า-ออกงาน, วันหยุดประจำตัวพนักงาน, ไฮไลท์วันหยุดตามกฎหมายแรงงาน และคำนวณค่าจ้างทดลองงาน
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={exportRosterToExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold border-none text-xs gap-1.5 shadow-xs"
          >
            <Download className="h-4 w-4" /> Export ตารางเวร & เงินเดือน (Excel)
          </Button>
          <Button
            variant="outline"
            onClick={handlePrint}
            className="bg-white/10 text-white hover:bg-white/20 border-white/20 text-xs gap-1.5"
          >
            <Printer className="h-4 w-4" /> พิมพ์ตารางงาน (Print A4)
          </Button>
        </div>
      </div>

      {/* ── Shift Preset Selector Bar (Hidden on Print) ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs print:hidden space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-teal-700" />
            <span className="text-sm font-bold text-slate-900">รูปแบบเวลาเข้า-ออกงาน (Shift Timing):</span>
            <Badge variant="outline" className="text-xs font-mono font-bold text-teal-800 bg-teal-50 border-teal-200">
              ร้านเปิด 09:00 - 20:00 น.
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
      <div className="grid gap-4 md:grid-cols-3 print:hidden">
        {EMPLOYEES.map((emp) => (
          <Card key={emp.id} className="border-slate-200 shadow-2xs overflow-hidden">
            <CardHeader className="p-4 bg-slate-50 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-teal-700" />
                  {emp.name}
                </CardTitle>
                <Badge
                  className={
                    emp.type === "monthly"
                      ? "bg-emerald-500 text-white font-semibold text-[10px]"
                      : "bg-amber-500 text-slate-950 font-bold text-[10px]"
                  }
                >
                  {emp.type === "monthly" ? "พนักงานประจำ" : "ทดลองงาน 350฿/วัน"}
                </Badge>
              </div>
              <CardDescription className="text-xs text-slate-500">{emp.role}</CardDescription>
            </CardHeader>
            <CardContent className="p-4 space-y-2 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-100">
                <span className="text-slate-500">วันหยุดประจำตัว:</span>
                <span className="font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md">
                  ❌ หยุด {emp.offDayName}
                </span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">รูปแบบค่าจ้าง:</span>
                <span className="font-semibold text-slate-700">{emp.wageNote}</span>
              </div>
              {emp.id === "jae" && (
                <div className="rounded-lg bg-amber-50 p-2 border border-amber-200/80 text-[11px] text-amber-900 font-medium">
                  💡 เดือนนี้ทำงาน {monthlyStats.jaeWorkDays} วัน = ประมาณการค่าจ้าง ฿
                  {monthlyStats.jaeEstimatedWage.toLocaleString()} บาท
                </div>
              )}
            </CardContent>
          </Card>
        ))}
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
                  [กะเช้า: {currentShiftTimes.morning} น.] · [กะสาย: {currentShiftTimes.late} น.] (ร้านเปิด 09:00 - 20:00 น.)
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
        <CardContent className="p-4">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-slate-700 pb-2 border-b border-slate-200">
            <div className="p-2 text-rose-600 bg-rose-50/50 rounded-lg">อาทิตย์ (มิ้ว OFF)</div>
            <div className="p-2 bg-slate-50 rounded-lg">จันทร์</div>
            <div className="p-2 bg-slate-50 rounded-lg">อังคาร</div>
            <div className="p-2 text-amber-700 bg-amber-50/50 rounded-lg">พุธ (เชียง OFF)</div>
            <div className="p-2 bg-slate-50 rounded-lg">พฤหัสบดี</div>
            <div className="p-2 text-indigo-700 bg-indigo-50/50 rounded-lg">ศุกร์ (เจ OFF)</div>
            <div className="p-2 bg-slate-50 rounded-lg">เสาร์</div>
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

          <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 print:hidden">
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
          <Info className="h-4 w-4" /> หมายเหตุและแนวทางปฏิบัติตามกฎหมายแรงงานไทย (SneakerCare Shop Policy)
        </div>
        <ul className="text-xs text-teal-100 space-y-1.5 list-disc list-inside print:text-slate-700">
          <li>
            <strong>เวลาทำการร้าน:</strong> 09:00 – 20:00 น. ทุกวัน โดยจัดกะทำงาน 2 กะ (เช้า {currentShiftTimes.morning} น. และ สาย {currentShiftTimes.late} น.) ชั่วโมงทำงานมาตรฐาน 8 ชั่วโมง/วัน (พัก 1 ชั่วโมง)
          </li>
          <li>
            <strong>วันหยุดประจำสัปดาห์ (1 วัน/สัปดาห์):</strong> พนักงานทุกคนมีวันหยุดประจำสัปดาห์คนละ 1 วันแน่นอนตามตาราง (เชียง: พุธ, เจ: ศุกร์, มิ้ว: อาทิตย์)
          </li>
          <li>
            <strong>วันหยุดตามประเพณี / นักขัตฤกษ์:</strong> ตาม พ.ร.บ. คุ้มครองแรงงาน นายจ้างต้องกำหนดวันหยุดตามประเพณีไม่น้อยกว่า 13 วัน/ปี หากพนักงานมาปฏิบัติงานในวันหยุดนักขัตฤกษ์ จะได้รับค่าตอบแทนทำงานในวันหยุด (Holiday Pay) หรือได้รับสิทธิ์หยุดชดเชยตามตกลง
          </li>
          <li>
            <strong>พนักงานทดลองงาน (เจ - วันละ 350 บาท):</strong> คำนวณค่าจ้างตามจำนวนวันที่มาปฏิบัติงานจริงในแต่ละเดือน (ปกติ 26 วัน/เดือน = 9,100 บาท) และสามารถบันทึกค่าล่วงเวลา (OT) เพิ่มเติมได้
          </li>
        </ul>
      </div>

      {/* ── Custom Shift Time Modal ── */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
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
        </div>
      )}

      {/* ── Interactive Day Detail & Shift Switcher Modal ── */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs print:hidden">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
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

            {/* Employee 1-Click Shift Controls */}
            <div className="space-y-3">
              {[
                { name: "เชียง", role: "ช่างหลัก", type: "ประจำ" },
                { name: "มิ้ว", role: "ผู้จัดการหน้าร้าน", type: "ประจำ" },
                { name: "เจ", role: "ทดลองงาน", type: "รายวัน" },
              ].map((emp) => {
                const isMorning = selectedDayDetail.morning.includes(emp.name);
                const isLate = selectedDayDetail.late.includes(emp.name);
                const isOff = selectedDayDetail.off.includes(emp.name);

                return (
                  <div
                    key={emp.name}
                    className="rounded-xl border border-slate-200 p-3 bg-slate-50/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{emp.name}</span>
                        <span className="text-[11px] text-slate-500">({emp.role})</span>
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
                        onClick={() => setEmployeeShift(selectedDayDetail.dateStr, emp.name, "morning")}
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
                        onClick={() => setEmployeeShift(selectedDayDetail.dateStr, emp.name, "late")}
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
                        onClick={() => setEmployeeShift(selectedDayDetail.dateStr, emp.name, "off")}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1 border ${
                          isOff
                            ? "bg-rose-600 text-white border-rose-600 shadow-xs ring-2 ring-rose-600/20"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:text-rose-700"
                        }`}
                      >
                        ❌ วันหยุด
                      </button>
                    </div>
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
        </div>
      )}
    </div>
  );
}

