import "server-only";
import { createClient } from "@/lib/supabase/server";
import { boundsFor, type MonthRange } from "@/lib/reports-range";

// query ของหน้ารายงาน อยู่ที่นี่ที่เดียว เพราะทั้งหน้าเว็บและปุ่มดาวน์โหลด CSV ต้องได้ข้อมูล
// "ชุดเดียวกันเป๊ะ" — ถ้าปล่อยให้แต่ละที่เขียน query เอง วันหนึ่งตัวเลขบนจอกับในไฟล์จะไม่ตรงกัน
// โดยไม่มีใครรู้ ซึ่งเป็นบั๊กประเภทที่หาสาเหตุยากที่สุด
//
// ตรรกะช่วงเดือนกับการจัดรูปแบบอยู่ที่ lib/reports-range.ts (ไม่มี dependency ฝั่งเซิร์ฟเวอร์
// จึงเขียนเทสต์ได้) — re-export ต่อจากที่นี่เพื่อให้ผู้เรียกเดิม import ที่เดียวได้เหมือนเดิม
export {
  DEFAULT_MONTHS_BACK,
  formatMonthLabel,
  resolveMonthRange,
  toCsv,
  type MonthRange,
} from "@/lib/reports-range";

export type MonthlyCogsRow = {
  branch_id: string;
  month: string;
  cogs: number | null;
};

export async function fetchMonthlyCogs(range: MonthRange, branchId: string | null) {
  const supabase = await createClient();
  const { gte, lt } = boundsFor(range);

  let query = supabase
    .from("v_monthly_cogs")
    .select("branch_id, month, cogs")
    .gte("month", gte)
    .lt("month", lt)
    .order("month", { ascending: false });

  if (branchId) query = query.eq("branch_id", branchId);

  const { data, error } = await query;
  return { rows: (data ?? []) as MonthlyCogsRow[], error };
}
