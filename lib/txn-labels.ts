import type { StockTxnType } from "@/lib/supabase/database.types";

export const TXN_TYPE_LABEL: Record<StockTxnType, string> = {
  stock_in: "รับเข้า",
  stock_out: "เบิกใช้",
  adjustment_increase: "ปรับเพิ่ม",
  adjustment_decrease: "ปรับลด",
  waste: "ของเสีย",
};
