"use client";

import { Calendar, ChevronDown } from "lucide-react";

export type TimeRangePreset =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "all"
  | string;

export const MONTH_OPTIONS = [
  { value: "all", label: "📊 ดูข้อมูลสะสมทั้งหมด (All Time: 10 เดือน)" },
  { value: "2026-08", label: "สิงหาคม 2569 (2026-08) — ล่าสุด" },
  { value: "2026-07", label: "กรกฎาคม 2569 (2026-07)" },
  { value: "2026-06", label: "มิถุนายน 2569 (2026-06)" },
  { value: "2026-05", label: "พฤษภาคม 2569 (2026-05)" },
  { value: "2026-04", label: "เมษายน 2569 (2026-04)" },
  { value: "2026-03", label: "มีนาคม 2569 (2026-03)" },
  { value: "2026-02", label: "กุมภาพันธ์ 2569 (2026-02)" },
  { value: "2026-01", label: "มกราคม 2569 (2026-01)" },
  { value: "2025-12", label: "ธันวาคม 2568 (2025-12)" },
  { value: "2025-11", label: "พฤศจิกายน 2568 (2025-11)" },
];

export function TimeRangeFilterBar({
  selectedRange,
  onSelectRange,
}: {
  selectedRange: string;
  onSelectRange: (range: string) => void;
}) {
  const PRESET_BUTTONS = [
    { id: "today", label: "🗓️ วันนี้" },
    { id: "this_week", label: "📅 สัปดาห์นี้" },
    { id: "this_month", label: "📆 เดือนนี้ (ส.ค. 69)" },
    { id: "last_month", label: "⏪ เดือนที่แล้ว (ก.ค. 69)" },
    { id: "all", label: "🌐 ทั้งหมด" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3 shadow-2xs">
      {/* Quick Presets Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-bold text-teal-950 mr-1 flex items-center gap-1">
          <Calendar className="h-3.5 w-3.5 text-teal-700" /> ช่วงเวลา:
        </span>
        {PRESET_BUTTONS.map((btn) => {
          const isActive = selectedRange === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => onSelectRange(btn.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? "bg-teal-800 text-white shadow-2xs"
                  : "bg-white text-slate-700 border border-slate-200 hover:bg-teal-50 hover:text-teal-900"
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {/* Specific Month Selector Dropdown */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            value={MONTH_OPTIONS.some((m) => m.value === selectedRange) ? selectedRange : "all"}
            onChange={(e) => onSelectRange(e.target.value)}
            className="appearance-none rounded-xl border-2 border-teal-600 bg-white py-1.5 pl-8 pr-8 text-xs font-bold text-teal-950 shadow-2xs hover:bg-teal-50/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer"
          >
            {MONTH_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Calendar className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-teal-700" />
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>
    </div>
  );
}
