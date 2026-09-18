"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export type UnderlineNavItem = {
  id: string;
  label: React.ReactNode;
  icon?: React.ElementType;
  href?: string;
};

/** แถบเครื่องมือย่อยแบบเส้นใต้ — ใช้ชุดเดียวกับคลังสินค้า ทั้งลิงก์และแท็บในหน้า */
export function UnderlineNav({
  items,
  value,
  onChange,
  "aria-label": ariaLabel = "เมนูย่อย",
  className,
}: {
  items: readonly UnderlineNavItem[];
  value: string;
  onChange?: (id: string) => void;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-slate-200 pb-px scrollbar-none dark:border-slate-800",
        className
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;
        const classNameInner = cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
          active
            ? "border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        );
        const body = (
          <>
            {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
            {item.label}
          </>
        );
        if (item.href) {
          return (
            <Link key={item.id} href={item.href} className={classNameInner}>
              {body}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange?.(item.id)}
            className={classNameInner}
          >
            {body}
          </button>
        );
      })}
    </nav>
  );
}
