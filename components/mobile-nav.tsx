"use client";

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, Footprints } from "lucide-react";
import { NavItem } from "@/components/main-nav";
import type { AppModule } from "@/lib/permissions";

interface MobileNavProps {
  items: readonly AppModule[];
  alerts?: Record<string, number>;
  brandName?: string;
  roleBadge?: string;
  displayName?: string;
}

/**
 * MobileNav — Hamburger button + slide-in drawer for screens < lg.
 * Hidden on lg+ (controlled by CSS only, no JS needed for hide/show).
 */
export function MobileNav({
  items,
  alerts = {},
  brandName = "Sneaker Care",
  roleBadge,
  displayName,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {/* ── Hamburger button (visible only on < lg) ── */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="เปิดเมนู"
        aria-expanded={open}
        className="lg:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* ── Drawer ── */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="เมนูหลัก"
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white dark:bg-slate-900 shadow-2xl border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 ease-in-out lg:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-4 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm">
              <Footprints className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white leading-tight">
                {brandName}
              </div>
              {(roleBadge || displayName) && (
                <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {roleBadge && (
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{roleBadge}</span>
                  )}
                  {roleBadge && displayName && <span className="mx-1">·</span>}
                  {displayName}
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="ปิดเมนู"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Nav items */}
        <nav
          aria-label="Mobile navigation"
          className="flex-1 overflow-y-auto py-3 px-3 space-y-0.5"
        >
          {items.map((item) => (
            <NavItem
              key={item.href}
              item={item}
              alertCount={alerts[item.key] ?? 0}
              onNavClick={close}
              variant="vertical"
            />
          ))}
        </nav>

        {/* Drawer footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-3">
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Sneaker Care Management System
          </p>
        </div>
      </aside>
    </>
  );
}
