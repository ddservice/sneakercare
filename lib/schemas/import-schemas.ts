import { z } from "zod";

// ── Helper: parse Thai/Western date strings ──
const dateStringSchema = z
  .string()
  .trim()
  .min(1, "วันที่ต้องไม่ว่าง")
  .transform((val) => {
    // DD/MM/YYYY or DD/MM/YY (Thai year)
    if (val.includes("/")) {
      const parts = val.split("/");
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const yearNum = parseInt(y);
        const finalYear = yearNum > 2500 ? yearNum - 543 : yearNum < 100 ? yearNum + 2000 : yearNum;
        return `${finalYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      }
    }
    return val; // already YYYY-MM-DD
  })
  .refine((val) => /^\d{4}-\d{2}-\d{2}$/.test(val), {
    message: "รูปแบบวันที่ไม่ถูกต้อง (ใช้ DD/MM/YYYY หรือ YYYY-MM-DD)",
  });

const nonNegativeNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
  z.number().min(0, "ค่าต้องไม่ติดลบ")
);

const positiveNum = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)),
  z.number().positive("ค่าต้องมากกว่า 0")
);

// ── 1. Sales Row Schema ──
export const SalesRowSchema = z.object({
  date: dateStringSchema,
  size_s: nonNegativeNum,
  size_m: nonNegativeNum,
  size_l: nonNegativeNum,
  size_xl: nonNegativeNum,
  total_revenue: nonNegativeNum,
  transfer_amount: nonNegativeNum,
  cash_amount: nonNegativeNum,
  discount: nonNegativeNum,
  gross_amount: nonNegativeNum,
});

export type ValidatedSalesRow = z.output<typeof SalesRowSchema>;

export function parseSalesRow(raw: Record<string, unknown>): {
  data?: ValidatedSalesRow;
  error?: string;
} {
  const mapped = {
    date: raw["วันที่"] ?? raw["date"] ?? raw[0],
    size_s: raw["Package S"] ?? raw["Package S (200฿)"] ?? raw["Size S"] ?? raw["size_s"] ?? raw[3] ?? 0,
    size_m: raw["Package M"] ?? raw["Package M (400฿)"] ?? raw["Size M"] ?? raw["size_m"] ?? raw[4] ?? 0,
    size_l: raw["Package L"] ?? raw["Package L (600฿)"] ?? raw["Size L"] ?? raw["size_l"] ?? raw[5] ?? 0,
    size_xl: raw["Package XL"] ?? raw["Package XL (800฿)"] ?? raw["Size XL"] ?? raw["size_xl"] ?? raw[6] ?? 0,
    total_revenue: raw["ยอดสุทธิ"] ?? raw["ยอดรวม"] ?? raw["total_revenue"] ?? raw[7] ?? 0,
    transfer_amount: raw["ยอดเงินโอน"] ?? raw["transfer_amount"] ?? raw[8] ?? 0,
    cash_amount: raw["ยอดเงินสด"] ?? raw["cash_amount"] ?? raw[9] ?? 0,
    discount: raw["ส่วนลด"] ?? raw["discount"] ?? raw[11] ?? 0,
    gross_amount: raw["ยอดก่อนลด"] ?? raw["gross_amount"] ?? raw[12] ?? 0,
  };

  const result = SalesRowSchema.safeParse(mapped);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return { error: msg };
  }
  return { data: result.data };
}

// ── 2. Stock Row Schema ──
export const StockRowSchema = z.object({
  name: z.string().trim().min(1, "ชื่อสินค้าต้องไม่ว่าง"),
  category: z.string().trim().default("ทั่วไป"),
  unit: z.string().trim().default("ชิ้น"),
  qty: nonNegativeNum,
  unit_cost: nonNegativeNum,
  min_stock: nonNegativeNum,
});

export type ValidatedStockRow = z.output<typeof StockRowSchema>;

export function parseStockRow(raw: Record<string, unknown>): {
  data?: ValidatedStockRow;
  error?: string;
} {
  const mapped = {
    name: raw["รายการวัสดุ"] ?? raw["รายการสินค้า"] ?? raw["name"] ?? raw[0] ?? "",
    category: raw["หมวดหมู่"] ?? raw["category"] ?? raw[1] ?? "ทั่วไป",
    unit: raw["หน่วย"] ?? raw["หน่วยนับ"] ?? raw["unit"] ?? raw[2] ?? "ชิ้น",
    qty: raw["คงเหลือ"] ?? raw["จำนวน"] ?? raw["qty"] ?? raw[3] ?? 0,
    unit_cost: raw["ราคาต้นทุน"] ?? raw["ราคาล่าสุด"] ?? raw["cost"] ?? raw[4] ?? 0,
    min_stock: raw["จุดสั่งซื้อขั้นต่ำ"] ?? raw["min_alert"] ?? raw[5] ?? 1,
  };

  const result = StockRowSchema.safeParse(mapped);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return { error: msg };
  }
  return { data: result.data };
}

// ── 3. Expenses Row Schema ──
export const ExpensesRowSchema = z.object({
  date: dateStringSchema,
  category: z.string().trim().default("ทั่วไป"),
  name: z.string().trim().min(1, "ชื่อรายการต้องไม่ว่าง"),
  amount: positiveNum,
  pay_method: z.string().trim().default("เงินสด"),
});

export type ValidatedExpensesRow = z.output<typeof ExpensesRowSchema>;

export function parseExpensesRow(raw: Record<string, unknown>): {
  data?: ValidatedExpensesRow;
  error?: string;
} {
  const mapped = {
    date: raw["วันที่"] ?? raw["date"] ?? raw[0] ?? "",
    category: raw["หมวดหมู่"] ?? raw["category"] ?? raw[1] ?? "ทั่วไป",
    name: raw["รายการ"] ?? raw["ชื่อรายการ"] ?? raw["item_name"] ?? raw[2] ?? "",
    amount: raw["จำนวนเงิน"] ?? raw["ยอดรวม"] ?? raw["amount"] ?? raw[3] ?? 0,
    pay_method: raw["ช่องทางชำระ"] ?? raw["pay_method"] ?? raw[4] ?? "เงินสด",
  };

  const result = ExpensesRowSchema.safeParse(mapped);
  if (!result.success) {
    const msg = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    return { error: msg };
  }
  return { data: result.data };
}
