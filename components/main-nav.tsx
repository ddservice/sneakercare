"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
  Boxes,
  Wallet,
  TrendingUp,
  Settings,
  FileText,
  Landmark,
  Calendar,
  ChevronDown,
} from "lucide-react";
import type { AppModule } from "@/lib/permissions";
import { groupAlertCount, navGroupsFor, type VisibleNavGroup } from "@/lib/nav-groups";
import { cn } from "@/lib/utils";

export const ICON_MAP: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  pos: Sparkles,
  invoicing: FileText,
  inventory: Boxes,
  expenses: Wallet,
  roster: Calendar,
  "tax-filing": Landmark,
  statistics: TrendingUp,
  settings: Settings,
};

interface MainNavProps {
  items: readonly AppModule[];
  alerts?: Record<string, number>;
  onNavClick?: () => void;
}

export function isActivePath(pathname: string, href: string, key: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard" || pathname === "/";
  if (pathname.startsWith(href)) return true;
  if (key === "inventory") {
    return ["/stock-in", "/stock-out", "/adjustments", "/history", "/reports", "/admin/items"].some(
      (p) => pathname.startsWith(p)
    );
  }
  if (key === "settings") {
    return ["/admin/users", "/admin/audit", "/admin/settings"].some((p) => pathname.startsWith(p));
  }
  return false;
}

export function useIsActive(href: string, key: string): boolean {
  return isActivePath(usePathname(), href, key);
}

export function MainNav({ items, alerts = {}, onNavClick }: MainNavProps) {
  const groups = navGroupsFor(items);
  return (
    <nav aria-label="เมนูหลัก" className="flex min-w-0 items-center gap-0.5">
      {groups.map((group) => (
        <NavGroup
          key={group.id}
          group={group}
          alerts={alerts}
          onNavClick={onNavClick}
        />
      ))}
    </nav>
  );
}

function NavGroup({
  group,
  alerts,
  onNavClick,
}: {
  group: VisibleNavGroup;
  alerts: Record<string, number>;
  onNavClick?: () => void;
}) {
  if (group.items.length === 1) {
    const item = group.items[0];
    return (
      <NavItem
        item={item}
        alertCount={alerts[item.key] ?? 0}
        onNavClick={onNavClick}
        variant="horizontal"
      />
    );
  }
  return <NavGroupMenu group={group} alerts={alerts} onNavClick={onNavClick} />;
}

function NavGroupMenu({
  group,
  alerts,
  onNavClick,
}: {
  group: VisibleNavGroup;
  alerts: Record<string, number>;
  onNavClick?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const childActive = group.items.some((item) => isActivePath(pathname, item.href, item.key));
  const alertCount = groupAlertCount(group, alerts);

  useEffect(() => {
    if (!open) return;
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-5 transition-colors xl:px-3 xl:text-sm",
          childActive || open
            ? "bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        )}
      >
        {group.label}
        {alertCount > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        ) : null}
        <ChevronDown className={cn("h-3.5 w-3.5 opacity-60 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 min-w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {group.items.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              alertCount={alerts[item.key] ?? 0}
              onNavClick={() => {
                setOpen(false);
                onNavClick?.();
              }}
              variant="menu"
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NavItem({
  item,
  alertCount = 0,
  onNavClick,
  variant = "horizontal",
}: {
  item: AppModule;
  alertCount?: number;
  onNavClick?: () => void;
  variant?: "horizontal" | "vertical" | "menu";
}) {
  const Icon = ICON_MAP[item.key] ?? LayoutDashboard;
  const isActive = useIsActive(item.href, item.key);
  const label = variant === "horizontal" ? (item.navLabel ?? item.label) : item.label;

  if (variant === "vertical" || variant === "menu") {
    return (
      <Link
        href={item.href}
        prefetch
        role={variant === "menu" ? "menuitem" : undefined}
        onClick={onNavClick}
        className={cn(
          "flex items-center gap-3 text-sm font-medium transition-colors",
          variant === "menu" ? "rounded-none px-3 py-2" : "rounded-xl px-3 py-2.5",
          isActive
            ? "bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200"
            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
        )}
      >
        <Icon
          className={cn(
            "h-4 w-4 shrink-0",
            isActive ? "text-teal-700 dark:text-teal-300" : "text-slate-400 dark:text-slate-500"
          )}
        />
        <span className="flex-1 leading-5">{label}</span>
        {alertCount > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-none text-white">
            {alertCount > 99 ? "99+" : alertCount}
          </span>
        )}
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      prefetch
      onClick={onNavClick}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-[13px] font-medium leading-5 transition-colors xl:px-3 xl:text-sm",
        isActive
          ? "bg-teal-50 text-teal-800 dark:bg-teal-950/50 dark:text-teal-200"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      )}
    >
      <span>{label}</span>
      {alertCount > 0 && (
        <span
          className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white"
          title={`${alertCount} รายการที่ต้องดูแล`}
        >
          {alertCount > 99 ? "99+" : alertCount}
        </span>
      )}
    </Link>
  );
}
