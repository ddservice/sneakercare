/** สะพานรับงาน → ยอดขายทางการ ห้ามนับรายได้สองครั้ง */

export type CheckoutPayment = "cash" | "transfer" | "credit" | "unpaid";

export type CheckoutInput = {
  orderId: string;
  orderNo: string;
  date: string;
  paymentMethod: CheckoutPayment;
  gross: number;
  discount: number;
  net: number;
  cash: number;
  transfer: number;
  serviceNames: string[];
};

export type PlannedSale = {
  date: string;
  cash: number;
  transfer: number;
  amountPaid: number;
  discount: number;
  gross: number;
  net: number;
  extraItems: string;
  paymentStatus: "ชำระครบ" | "ค้างชำระ";
  clientRequestId: string;
};

export type PlannedStockOut = {
  itemId: string;
  qty: number;
};

export function shouldPostSale(payment: CheckoutPayment): boolean {
  return payment === "cash" || payment === "transfer" || payment === "credit";
}

export function planCheckout(input: CheckoutInput): { sale: PlannedSale | null } {
  if (!shouldPostSale(input.paymentMethod)) {
    return { sale: null };
  }

  const gross = Math.max(0, Number(input.gross) || 0);
  const discount = Math.max(0, Number(input.discount) || 0);
  const net = Math.max(0, Number(input.net) || 0);
  // บัตรเครดิตในฟอร์ม = รับเงินแล้ว ไม่ใช่ขายเชื่อ — ลงช่องโอน (ไม่ใช่เงินสดลิ้นชัก)
  const cash = input.paymentMethod === "cash" ? net : Math.max(0, Number(input.cash) || 0);
  const transfer =
    input.paymentMethod === "transfer" || input.paymentMethod === "credit"
      ? net
      : Math.max(0, Number(input.transfer) || 0);
  const amountPaid = cash + transfer;
  const names = input.serviceNames.map((n) => n.trim()).filter(Boolean);
  const extra = [`ใบรับงาน ${input.orderNo}`, ...names].join(" · ");

  return {
    sale: {
      date: input.date,
      cash,
      transfer,
      amountPaid,
      discount,
      gross,
      net,
      extraItems: extra,
      paymentStatus: amountPaid >= net && net > 0 ? "ชำระครบ" : "ค้างชำระ",
      clientRequestId: input.orderId,
    },
  };
}

export function planStockOuts(
  lines: readonly { itemId?: string; qty?: number }[]
): { ok: true; lines: PlannedStockOut[] } | { ok: false; error: string } {
  const out: PlannedStockOut[] = [];
  for (const line of lines) {
    const itemId = String(line.itemId ?? "").trim();
    const qty = Number(line.qty);
    if (!itemId && (!qty || qty === 0)) continue;
    if (!itemId) return { ok: false, error: "กรุณาเลือกสินค้าที่เบิก" };
    if (!Number.isFinite(qty) || qty <= 0) return { ok: false, error: "จำนวนเบิกต้องมากกว่า 0" };
    out.push({ itemId, qty });
  }
  return { ok: true, lines: out };
}
