import type { UserRole } from "@/lib/supabase/database.types";

export type Role = UserRole;

export const ROLES = ["admin", "co_admin", "staff"] as const;

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  co_admin: "Co-Admin",
  staff: "Staff",
};

export type ModuleKey =
  | "dashboard"
  | "pos"
  | "invoicing"
  | "inventory"
  | "expenses"
  | "roster"
  | "expenses-ocr"
  | "tax-filing"
  | "statistics"
  | "stock-out"
  | "stock-in"
  | "adjustments"
  | "history"
  | "reports"
  | "items"
  | "users"
  | "audit"
  | "settings";

export type AppModule = {
  key: ModuleKey;
  href: string;
  label: string;
  icon?: string;
  isMainTab?: boolean;
  viewRoles: readonly Role[];
  writeRoles: readonly Role[];
  note?: string;
};

// สิทธิ์นี้สอดคล้องกับ RLS / staff-safe views — UI เป็นด่านซ่อนปุ่มเท่านั้น
export const APP_MODULES: readonly AppModule[] = [
  // ── MAIN TABS ──
  {
    key: "dashboard",
    href: "/dashboard",
    label: "ภาพรวม",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "pos",
    href: "/pos",
    label: "งานบริการ/ยอดขาย",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin", "staff"],
  },
  {
    key: "invoicing",
    href: "/invoicing",
    label: "ออกเอกสาร & วางบิล",
    isMainTab: true,
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "inventory",
    href: "/inventory",
    label: "คลังสินค้า",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin", "staff"],
  },
  {
    key: "expenses",
    href: "/expenses",
    label: "ค่าใช้จ่าย & พนักงาน",
    isMainTab: true,
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "roster",
    href: "/roster",
    label: "ตารางงาน & กะ",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin"],
  },
  {
    key: "expenses-ocr",
    href: "/expenses-ocr",
    label: "สแกนใบเสร็จ & สลิป",
    isMainTab: true,
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin", "staff"],
  },
  {
    key: "tax-filing",
    href: "/tax-filing",
    label: "ภาษี & e-Tax",
    isMainTab: true,
    viewRoles: ["admin"],
    writeRoles: ["admin"],
  },
  {
    key: "statistics",
    href: "/statistics",
    label: "สถิติ",
    isMainTab: true,
    viewRoles: ["admin", "co_admin"],
    writeRoles: [],
  },
  {
    key: "settings",
    href: "/settings",
    label: "ตั้งค่า",
    isMainTab: true,
    viewRoles: ["admin"],
    writeRoles: ["admin"],
  },

  // ── INVENTORY & ADMIN SUB-MODULES ──
  {
    key: "stock-out",
    href: "/stock-out",
    label: "เบิกใช้งาน",
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin", "co_admin", "staff"],
    note: "แท็บของเสียกรอกได้เฉพาะ Admin/Co-Admin",
  },
  {
    key: "stock-in",
    href: "/stock-in",
    label: "รับของเข้า",
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
    note: "มีช่องต้นทุน — Staff เข้าไม่ได้",
  },
  {
    key: "adjustments",
    href: "/adjustments",
    label: "ปรับปรุงสต๊อก",
    viewRoles: ["admin", "co_admin"],
    writeRoles: ["admin", "co_admin"],
    note: "Co-Admin กรอกได้ แต่ต้องรอ Admin อนุมัติ",
  },
  {
    key: "history",
    href: "/history",
    label: "ประวัติ",
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: [],
    note: "ตาราง append-only แก้/ลบไม่ได้ — Staff ซ่อนคอลัมน์ต้นทุน",
  },
  {
    key: "reports",
    href: "/reports",
    label: "รายงาน",
    viewRoles: ["admin", "co_admin"],
    writeRoles: [],
    note: "COGS / สรุปมูลค่าเบิกใช้ — Staff เข้าไม่ได้",
  },
  {
    key: "items",
    href: "/admin/items",
    label: "สินค้า",
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin"],
    note: "Staff/Co-Admin ดูเพื่อเลือกเบิกได้ แต่แก้ราคา/เพิ่มตัวใหม่ไม่ได้",
  },
  {
    key: "users",
    href: "/admin/users",
    label: "ผู้ใช้",
    viewRoles: ["admin"],
    writeRoles: ["admin"],
  },
  {
    key: "audit",
    href: "/admin/audit",
    label: "Audit Log",
    viewRoles: ["admin"],
    writeRoles: [],
    note: "อ่านอย่างเดียว ลบไม่ได้เด็ดขาด (มี trigger ดัก)",
  },
] as const;

export function canView(role: Role, key: ModuleKey): boolean {
  const mod = APP_MODULES.find((m) => m.key === key);
  if (!mod) return false;
  return (mod.viewRoles as readonly string[]).includes(role);
}

export function canWrite(role: Role, key: ModuleKey): boolean {
  const mod = APP_MODULES.find((m) => m.key === key);
  if (!mod) return false;
  return (mod.writeRoles as readonly string[]).includes(role);
}

export function visibleModulesFor(role: Role): readonly AppModule[] {
  return APP_MODULES.filter((m) => (m.viewRoles as readonly string[]).includes(role));
}

export function mainNavItemsFor(role: Role): readonly AppModule[] {
  return APP_MODULES.filter(
    (m) => m.isMainTab && (m.viewRoles as readonly string[]).includes(role)
  );
}

export function canSeeCost(role: Role): boolean {
  return role === "admin" || role === "co_admin";
}

export function canManageUsers(role: Role): boolean {
  return role === "admin";
}

export function canEditMinStock(role: Role): boolean {
  return role === "admin" || role === "co_admin";
}

export function canRecordWaste(role: Role): boolean {
  return role === "admin" || role === "co_admin";
}

