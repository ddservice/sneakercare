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
  Sparkles,
  Users,
  Sun,
  Sunset,
  DollarSign,
  Info,
  Building,
  CheckCircle2,
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
    color: "bg-teal-700 text-white",
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

// Weekly Shift Template (Day of week: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
// Morning: 08:30 - 17:30
// Late: 10:30 - 19:30
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
  // Start from September 2026 (Month index 8 in 0-indexed JS Date)
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [currentMonth, setCurrentMonth] = useState<number>(8); // 8 = September
  const [selectedDayDetail, setSelectedDayDetail] = useState<{
    dateStr: string;
    dayOfWeek: number;
    dayNum: number;
    holiday?: string;
    morning: string[];
    late: string[];
    off: string[];
  } | null>(null);

  // Generate Calendar Days for Current Month
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
      const shift = WEEKLY_SHIFTS[dayOfWeek];

      days.push({
        dateStr,
        dayNum: d,
        dayOfWeek,
        holiday,
        morning: shift.morning,
        late: shift.late,
        off: shift.off,
      });
    }

    return days;
  }, [currentYear, currentMonth]);

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
    const dailyScheduleData = (calendarDays.filter(Boolean) as any[]).map((d) => ({
      "วันที่": d.dateStr,
      "วัน": WEEKLY_SHIFTS[d.dayOfWeek]?.dayName || "",
      "กะเช้า (08:30-17:30)": d.morning.join(", "),
      "กะสาย (10:30-19:30)": d.late.join(", "),
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
            SneakerCare Smart Roster System (1 ก.ย. 2569 เป็นต้นไป)
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ตารางการทำงาน & ปฏิทินกะพนักงาน</h2>
          <p className="text-sm text-teal-100/80">
            ระบบจัดตารางกะรายวัน, วันหยุดประจำตัวพนักงาน, ไฮไลท์วันหยุดตามกฎหมายแรงงาน และคำนวณค่าจ้างทดลองงานรายวัน (วันละ 350฿)
          </p>
        </div>

        <div className="flex items-center gap-2">
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
                      ? "bg-teal-700 text-white font-semibold text-[10px]"
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
                <h3 className="text-base font-bold text-slate-900">
                  ตารางงานประจำเดือน {MONTH_NAMES_THAI[currentMonth]} {currentYear + 543}
                </h3>
                <p className="text-xs text-slate-500">
                  [กะเช้า: 08:30 - 17:30 น.] · [กะสาย: 10:30 - 19:30 น.]
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
                      : day.dayOfWeek === 0
                      ? "bg-amber-50/20 border-slate-200"
                      : "bg-white border-slate-200 hover:border-teal-400"
                  }`}
                >
                  {/* Day Header */}
                  <div>
                    <div className="flex items-center justify-between">
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
                        <span className="font-semibold text-teal-800">
                          เช้า: {day.morning.join(", ")}
                        </span>
                      </div>

                      {/* Late Shift */}
                      <div className="flex items-start gap-1 text-[10px] text-slate-700">
                        <Sunset className="h-3 w-3 text-indigo-500 shrink-0 mt-0.5" />
                        <span className="font-semibold text-indigo-800">
                          สาย: {day.late.join(", ")}
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
        </CardContent>
      </Card>

      {/* ── Thai Labor Law & Shop Notice Footer ── */}
      <div className="rounded-2xl bg-slate-900 p-6 text-white space-y-3 print:bg-white print:text-slate-900 print:border print:border-slate-300">
        <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
          <Info className="h-4 w-4" /> หมายเหตุและแนวทางปฏิบัติตามกฎหมายแรงงานไทย (SneakerCare Shop Policy)
        </div>
        <ul className="text-xs text-slate-300 space-y-1.5 list-disc list-inside print:text-slate-700">
          <li>
            <strong>วันหยุดประจำสัปดาห์ (1 วัน/สัปดาห์):</strong> พนักงานทุกคนมีวันหยุดประจำสัปดาห์คนละ 1 วันแน่นอนตามตาราง (เชียง: พุธ, เจ: ศุกร์, มิ้ว: อาทิตย์)
          </li>
          <li>
            <strong>วันหยุดตามประเพณี / นักขัตฤกษ์:</strong> ตาม พ.ร.บ. คุ้มครองแรงงาน นายจ้างต้องกำหนดวันหยุดตามประเพณีไม่น้อยกว่า 13 วัน/ปี หากพนักงานมาปฏิบัติงานในวันหยุดนักขัตฤกษ์ จะได้รับค่าตอบแทนทำงานในวันหยุด (Holiday Pay) หรือได้รับสิทธิ์หยุดชดเชยตามตกลง
          </li>
          <li>
            <strong>พนักงานทดลองงาน (มิ้ว - วันละ 350 บาท):</strong> คำนวณค่าจ้างตามจำนวนวันที่มาปฏิบัติงานจริงในแต่ละเดือน (ปกติ 26 วัน/เดือน = 9,100 บาท) และสามารถบันทึกค่าล่วงเวลา (OT) เพิ่มเติมได้
          </li>
        </ul>
      </div>

      {/* ── Day Detail Modal (Optional Quick View) ── */}
      {selectedDayDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-teal-700" />
                รายละเอียดกะวันที่ {selectedDayDetail.dayNum} {MONTH_NAMES_THAI[currentMonth]} {currentYear + 543}
              </h4>
              <button
                onClick={() => setSelectedDayDetail(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {selectedDayDetail.holiday && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-900 font-bold">
                ★ วันหยุดนักขัตฤกษ์: {selectedDayDetail.holiday}
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div className="rounded-xl bg-teal-50 p-3 border border-teal-100">
                <div className="font-bold text-teal-900 flex items-center gap-1.5 pb-1">
                  <Sun className="h-3.5 w-3.5 text-amber-500" /> กะเช้า (08:30 - 17:30 น.)
                </div>
                <div className="text-teal-800 font-semibold">{selectedDayDetail.morning.join(", ")}</div>
              </div>

              <div className="rounded-xl bg-indigo-50 p-3 border border-indigo-100">
                <div className="font-bold text-indigo-900 flex items-center gap-1.5 pb-1">
                  <Sunset className="h-3.5 w-3.5 text-indigo-500" /> กะสาย (10:30 - 19:30 น.)
                </div>
                <div className="text-indigo-800 font-semibold">{selectedDayDetail.late.join(", ")}</div>
              </div>

              {selectedDayDetail.off.length > 0 && (
                <div className="rounded-xl bg-slate-100 p-3 border border-slate-200">
                  <div className="font-bold text-slate-700 pb-1">❌ วันหยุดประจำสัปดาห์ (OFF)</div>
                  <div className="text-slate-600 font-semibold">{selectedDayDetail.off.join(", ")}</div>
                </div>
              )}
            </div>

            <Button
              onClick={() => setSelectedDayDetail(null)}
              className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs"
            >
              ปิดหน้าต่าง
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
