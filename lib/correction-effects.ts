/** ผลของใบลดหนี้ — แยกเงิน/VAT ชั้นเอกสาร กับการรับคืนของ ห้ามกลับ GL ถ้ายังไม่มีสมุดรายวัน */

export type CorrectionReason = "price_adjustment" | "service_compensation" | "physical_return";

export type ReturnCondition = "sellable" | "waste" | "unknown";
export type ReturnCostBasis = "original" | "current";

export type PhysicalReturnLine = {
  itemId: string;
  qty: number;
  condition: ReturnCondition;
  costBasis?: ReturnCostBasis;
  originalUnitCost?: number;
};

export function needsPhysicalReturn(reason: CorrectionReason): boolean {
  return reason === "physical_return";
}

export function correctionReasonLabel(reason: CorrectionReason): string {
  if (reason === "price_adjustment") return "ลดราคา";
  if (reason === "service_compensation") return "ชดเชยค่าบริการ";
  return "รับคืนของ";
}

export function correctionNotesPrefix(reason: CorrectionReason): string {
  return `เหตุผลใบลดหนี้: ${correctionReasonLabel(reason)} — ไม่กลับบัญชีร้าน/GL และไม่คืนสต๊อกจนกว่าจะยืนยันรับคืนของ`;
}

export function planCorrectionBooksEffect(input: {
  hasGeneralLedger: boolean;
  reverseScSalesRequested: boolean;
}): { reverseGl: false; reverseScSales: false; note: string } {
  if (!input.hasGeneralLedger) {
    return {
      reverseGl: false,
      reverseScSales: false,
      note: "ยังไม่มีสมุดรายวัน — ใบลดหนี้ไม่กลับบัญชีครบ และยังไม่แตะ sc_sales จนกว่าจะมีมติเชื่อมยอดขาย/ลูกหนี้/ภาษี",
    };
  }
  return {
    reverseGl: false,
    reverseScSales: false,
    note: "มี GL แล้วก็ยังต้องมติแยกก่อนกลับรายการ — ค่าเริ่มต้นไม่กลับ",
  };
}

export function planReturnCost(input: {
  originalUnitCost: number | null | undefined;
  sellingPrice: number;
}): { ok: true; unitCost: number; basis: "original" } | { ok: false; error: string } {
  const cost = Number(input.originalUnitCost);
  if (!Number.isFinite(cost) || cost <= 0) {
    return { ok: false, error: "ยังไม่มีต้นทุนที่ตัดจากรายการขายเดิม — ห้ามใช้ราคาขายแทน รอตรวจก่อนรับคืน" };
  }
  void input.sellingPrice;
  return { ok: true, unitCost: cost, basis: "original" };
}

export function planPhysicalReturn(input: {
  reason: CorrectionReason;
  confirmed: boolean;
  lines: readonly PhysicalReturnLine[];
  requestId: string;
  alreadyPostedRequestIds?: readonly string[];
}):
  | { ok: true; replay: boolean; stock: false }
  | { ok: true; replay: boolean; stock: true; lines: PhysicalReturnLine[] }
  | { ok: false; error: string } {
  const requestId = String(input.requestId || "").trim();
  if (!requestId) return { ok: false, error: "ต้องมีคีย์กันซ้ำก่อนรับคืนของ" };
  if ((input.alreadyPostedRequestIds ?? []).includes(requestId)) {
    return { ok: true, replay: true, stock: false };
  }
  if (!needsPhysicalReturn(input.reason)) {
    return { ok: true, replay: false, stock: false };
  }
  if (!input.confirmed) return { ok: false, error: "ต้องยืนยันรายการรับคืนของก่อนเพิ่มสต๊อก" };
  if (!input.lines.length) return { ok: false, error: "รับคืนของต้องมีรายการสินค้า" };
  for (const line of input.lines) {
    if (!String(line.itemId || "").trim()) return { ok: false, error: "รายการรับคืนต้องระบุสินค้า" };
    if (!Number.isFinite(line.qty) || line.qty <= 0) return { ok: false, error: "จำนวนรับคืนต้องมากกว่า 0" };
    if (line.condition === "unknown") return { ok: false, error: "ต้องระบุสภาพสินค้าก่อนรับคืนเข้าคลัง" };
    if (!line.costBasis) return { ok: false, error: "ต้องเลือกต้นทุนอ้างอิงก่อนรับคืน" };
    const cost = planReturnCost({
      originalUnitCost: line.originalUnitCost,
      sellingPrice: 0,
    });
    if (line.costBasis === "original" && !cost.ok) return cost;
  }
  return { ok: true, replay: false, stock: true, lines: [...input.lines] };
}
