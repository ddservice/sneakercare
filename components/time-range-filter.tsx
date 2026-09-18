"use client";

import { useMemo } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { buildIsoMonthOptions, thaiMonthShort } from "@/lib/thai-months";

export type TimeRangePreset =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "all"
  | string;

export function TimeRangeFilterBar({
  selectedRange,
  onSelectRange,
}: {
  selectedRange: string;
  onSelectRange: (range: string) => void;
}) {
  const { monthOptions, thisMonthShort, lastMonthShort } = useMemo(() => {
    const now = new Date();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      monthOptions: buildIsoMonthOptions(24, now),
      thisMonthShort: thaiMonthShort(now.getFullYear(), now.getMonth()),
      lastMonthShort: thaiMonthShort(last.getFullYear(), last.getMonth()),
    };
  }, []);

  const presets = [
    { id: "today", label: "วันนี้" },
    { id: "this_week", label: "สัปดาห์นี้" },
    { id: "this_month", label: `เดือนนี้ (${thisMonthShort})` },
    { id: "last_month", label: `เดือนที่แล้ว (${lastMonthShort})` },
    { id: "all", label: "ทั้งหมด" },
  ];

  const monthSelectValue = monthOptions.some((m) => m.value === selectedRange)
    ? selectedRange
    : "";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <Calendar className="h-3.5 w-3.5 text-slate-500" /> ช่วงเวลา
        </span>
        {presets.map((btn) => {
          const isActive = selectedRange === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              onClick={() => onSelectRange(btn.id)}
              className={`cursor-pointer rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                isActive
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <select
          value={monthSelectValue}
          onChange={(e) => onSelectRange(e.target.value)}
          className="appearance-none cursor-pointer rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-xs font-medium text-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-slate-400/30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        >
          <option value="">เลือกเดือน…</option>
          {monthOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <Calendar className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
      </div>
    </div>
  );
}
