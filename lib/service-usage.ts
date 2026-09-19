/** สูตรของใช้ต่องาน — ตัดอัตโนมัติปิดไว้จนกว่าจะมีสูตรที่อนุมัติและจุดตัดที่เลือกแล้ว */

export type StockCutPoint = "receive" | "start" | "complete";

export type UsageFormula = {
  serviceId: string;
  itemId: string;
  qtyBase: number;
  version: number;
  effectiveFrom: string;
  approved: boolean;
  unit: string;
};

export type UsageFlags = {
  autoIssueEnabled: boolean;
  cutPoint: StockCutPoint | null;
};

export const DEFAULT_USAGE_FLAGS: UsageFlags = {
  autoIssueEnabled: false,
  cutPoint: null,
};

/** ปิดเส้นตัดจริงทั้งระบบ — เก็บสูตร/จุดตัดได้ แต่ POS ยังไม่เขียนคลัง */
export const LIVE_AUTO_ISSUE_ALLOWED = false;

export function mayLiveAutoIssue(flags: UsageFlags): boolean {
  if (!LIVE_AUTO_ISSUE_ALLOWED) return false;
  return flags.autoIssueEnabled === true && flags.cutPoint !== null;
}

export function planLiveStockIssue(input?: {
  flags?: UsageFlags;
  requestedPoint?: StockCutPoint;
}): { ok: false; error: string } {
  void input;
  return {
    ok: false,
    error: "ตัดสต๊อกอัตโนมัติยังปิดที่ระดับระบบ — เบิกมือที่ /stock-out",
  };
}

export function planSaveUsageFlags(input: UsageFlags): { ok: true; flags: UsageFlags } | { ok: false; error: string } {
  if (input.autoIssueEnabled) {
    return {
      ok: false,
      error: "ยังเปิดตัดอัตโนมัติไม่ได้ — รอจุดตัดที่อนุมัติ ธุรกรรมกันซ้ำ และมติเจ้าของ",
    };
  }
  const cutPoint =
    input.cutPoint === "receive" || input.cutPoint === "start" || input.cutPoint === "complete" ? input.cutPoint : null;
  return { ok: true, flags: { autoIssueEnabled: false, cutPoint } };
}

export function selectFormula(
  formulas: readonly UsageFormula[],
  serviceId: string,
  onDate: string
): UsageFormula | null {
  const eligible = formulas
    .filter(
      (row) =>
        row.serviceId === serviceId &&
        row.approved &&
        row.effectiveFrom <= onDate &&
        Number(row.qtyBase) > 0 &&
        String(row.itemId || "").trim() !== ""
    )
    .sort((a, b) => b.version - a.version || b.effectiveFrom.localeCompare(a.effectiveFrom));
  return eligible[0] ?? null;
}

export function guessUsageFromServiceName(_name: string): null {
  return null;
}

export function planReservation(
  formulas: readonly UsageFormula[],
  serviceIds: readonly string[],
  onDate: string
): { ok: true; lines: { itemId: string; qtyBase: number; formulaVersion: number }[] } | { ok: false; error: string } {
  const lines: { itemId: string; qtyBase: number; formulaVersion: number }[] = [];
  for (const serviceId of serviceIds) {
    const formula = selectFormula(formulas, serviceId, onDate);
    if (!formula) return { ok: false, error: `ยังไม่มีสูตรที่อนุมัติสำหรับบริการ ${serviceId}` };
    lines.push({ itemId: formula.itemId, qtyBase: formula.qtyBase, formulaVersion: formula.version });
  }
  return { ok: true, lines };
}

export function planAutoIssue(input: {
  flags: UsageFlags;
  requestedPoint: StockCutPoint;
  reservation: { itemId: string; qtyBase: number }[];
  actual?: { itemId: string; qtyBase: number }[] | null;
}):
  | { ok: true; mode: "reserved" | "issued"; lines: { itemId: string; qtyBase: number }[] }
  | { ok: false; error: string } {
  const live = planLiveStockIssue(input);
  if (!live.ok) return live;
  if (!input.flags.autoIssueEnabled) {
    return { ok: false, error: "ตัดสต๊อกอัตโนมัติยังไม่เปิด — เบิกมือที่ /stock-out" };
  }
  if (!input.flags.cutPoint) {
    return { ok: false, error: "ยังไม่ได้เลือกจุดตัดสต๊อก (รับงาน / เริ่มงาน / ปิดงาน)" };
  }
  if (input.flags.cutPoint !== input.requestedPoint) {
    return { ok: false, error: "จุดนี้ยังไม่ใช่จุดตัดสต๊อกที่อนุมัติ" };
  }
  if (!input.reservation.length) return { ok: false, error: "ไม่มีรายการจองจากสูตร" };
  if (!input.actual) {
    return { ok: true, mode: "reserved", lines: input.reservation };
  }
  return { ok: true, mode: "issued", lines: input.actual };
}

export function usageVariance(
  formulaQty: number,
  actualQty: number
): { formulaQty: number; actualQty: number; delta: number } {
  const formula = Number(formulaQty) || 0;
  const actual = Number(actualQty) || 0;
  return { formulaQty: formula, actualQty: actual, delta: actual - formula };
}
