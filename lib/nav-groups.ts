import type { AppModule, ModuleKey } from "./permissions";

export type NavGroupId = "service" | "money" | "inventory" | "people" | "settings";

export type NavGroupDef = {
  id: NavGroupId;
  label: string;
  keys: readonly ModuleKey[];
};

/** ลำดับเมนูหัวเว็บ — ไม่แตะ viewRoles; กรองจากรายการที่ role เห็นแล้วเท่านั้น */
export const NAV_GROUPS: readonly NavGroupDef[] = [
  { id: "service", label: "งานบริการ", keys: ["pos"] },
  {
    id: "money",
    label: "เงิน",
    keys: ["dashboard", "invoicing", "expenses", "tax-filing", "statistics"],
  },
  { id: "inventory", label: "คลัง", keys: ["inventory"] },
  { id: "people", label: "ตารางงาน", keys: ["roster"] },
  { id: "settings", label: "ตั้งค่า", keys: ["settings"] },
];

export type VisibleNavGroup = {
  id: NavGroupId;
  label: string;
  items: AppModule[];
};

export function navGroupsFor(items: readonly AppModule[]): VisibleNavGroup[] {
  const byKey = new Map<ModuleKey, AppModule>();
  for (const item of items) byKey.set(item.key, item);

  const groups: VisibleNavGroup[] = [];
  for (const group of NAV_GROUPS) {
    const visible: AppModule[] = [];
    for (const key of group.keys) {
      const item = byKey.get(key);
      if (item) visible.push(item);
    }
    if (visible.length > 0) {
      groups.push({ id: group.id, label: group.label, items: visible });
    }
  }
  return groups;
}

export function groupAlertCount(
  group: VisibleNavGroup,
  alerts: Record<string, number>
): number {
  return group.items.reduce((sum, item) => sum + (alerts[item.key] ?? 0), 0);
}
