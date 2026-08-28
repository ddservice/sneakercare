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
  | "inventory"
  | "expenses"
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

// สิทธิ์นี้ต้องสอดคล้องกับ RLS / staff-safe views — UI เป็นด่านซ่อนปุ่มเท่านั้น
export const APP_MODULES: readonly AppModule[] = [
  // ── 6 MAIN TABS (เหมือนระบบเดิม แต่เป็นมืออาชีพ) ──
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
    note: "Staff เห็นจำนวนอย่างเดียว ไม่เห็นต้นทุน",
  },
  {
    key: "reports",
    href: "/reports",
    label: "รายงาน",
    viewRoles: ["admin", "co_admin"],
    writeRoles: [],
    note: "มี COGS — Staff เข้าไม่ได้",
  },
  {
    key: "items",
    href: "/admin/items",
    label: "สินค้า",
    viewRoles: ["admin", "co_admin", "staff"],
    writeRoles: ["admin"],
    note: "แคตตาล็อกกลางแก้ได้เฉพาะ Admin เพราะกระทบทุกสาขา",
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
    viewRoles: ["admin", "co_admin"],
    writeRoles: [],
    note: "อ่านอย่างเดียว แม้แต่ Admin ก็แก้/ลบไม่ได้",
  },
];

export function getModule(key: ModuleKey): AppModule {
  const mod = APP_MODULES.find((item) => item.key === key);
  if (!mod) throw new Error(`Unknown module: ${key}`);
  return mod;
}

export function canView(role: Role, key: ModuleKey): boolean {
  return getModule(key).viewRoles.includes(role);
}

export function canWrite(role: Role, key: ModuleKey): boolean {
  return getModule(key).writeRoles.includes(role);
}

export function canSeeCost(role: Role): boolean {
  return role === "admin" || role === "co_admin";
}

export function canRecordWaste(role: Role): boolean {
  return role === "admin" || role === "co_admin";
}

export function mainNavItemsFor(role: Role): readonly AppModule[] {
  return APP_MODULES.filter((item) => item.isMainTab && item.viewRoles.includes(role));
}

export function navItemsFor(role: Role): readonly AppModule[] {
  return APP_MODULES.filter((item) => item.viewRoles.includes(role));
}
