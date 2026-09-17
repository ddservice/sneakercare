"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  ClipboardList,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canView, type ModuleKey, type Role } from "@/lib/permissions";

const NAV = [
  { href: "/inventory", label: "สต๊อก", icon: Boxes, exact: true, module: "inventory" as const },
  { href: "/stock-in", label: "รับเข้า", icon: ArrowDownToLine, exact: false, module: "stock-in" as const },
  { href: "/stock-out", label: "เบิกใช้", icon: ArrowUpFromLine, exact: false, module: "stock-out" as const },
  { href: "/adjustments", label: "ตรวจนับ", icon: ClipboardList, exact: false, module: "adjustments" as const },
  { href: "/history", label: "ประวัติ", icon: History, exact: false, module: "history" as const },
] satisfies { href: string; label: string; icon: typeof Boxes; exact: boolean; module: ModuleKey }[];

export function InventoryShell({
  title,
  description,
  actions,
  role,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  role: Role;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const items = NAV.filter((item) => canView(role, item.module));

  return (
    <div className="space-y-6">
      <header className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
              {title}
            </h1>
            {description ? (
              <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </div>

        <nav
          aria-label="เมนูคลังสินค้า"
          className="flex gap-1 overflow-x-auto border-b border-slate-200 pb-px scrollbar-none dark:border-slate-800"
        >
          {items.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300"
                    : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {children}
    </div>
  );
}

export function InventoryFormPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {children}
    </div>
  );
}

export function InventoryAlert({
  tone,
  children,
}: {
  tone: "error" | "success";
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "rounded-xl px-3 py-2.5 text-sm font-medium",
        tone === "error"
          ? "border border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-300"
          : "border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
      )}
    >
      {children}
    </p>
  );
}

export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string; icon?: React.ReactNode }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              selected
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const inventoryFieldLabel =
  "text-sm font-medium text-slate-700 dark:text-slate-300";
export const inventoryInput = "h-10 text-sm";
