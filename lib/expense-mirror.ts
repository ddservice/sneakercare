import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { categoryKeyFor } from "@/lib/expense-categories";

/**
 * เขียนค่าใช้จ่ายลง `sc_expense_entries` ควบคู่ไปกับ `sc_opex` (ขั้นที่ 2 ของ
 * docs/sc-opex-refactor-plan.md — "เขียนสองที่")
 *
 * ⚠️ ทำไมต้องเขียนสองที่แทนที่จะย้ายเลย: หน้าการเงินของระบบเดิม
 * (`legacy/sneakercare_dashboard.html` ที่ยังใช้งานจริงทุกวัน) อ่านและเขียน `sc_opex` ตรงๆ
 * ผ่าน Google Apps Script ซึ่ง repo นี้แก้ไม่ได้ ⇒ ถ้าหยุดเขียน `sc_opex` เมื่อไหร่
 * ตัวเลขในหน้าการเงินของระบบเดิมจะเพี้ยนทันทีโดยไม่มีใครรู้
 *
 * ⚠️ **`sc_opex` ยังเป็นแหล่งข้อมูลจริงอยู่** — ตารางใหม่ยังไม่มีหน้าไหนอ่าน
 * จนกว่าจะถึงขั้นที่ 4 ของแผน จึงจงใจให้ฟังก์ชันในไฟล์นี้ **ไม่ throw** เด็ดขาด:
 * ถ้ากระจกเงาเขียนไม่สำเร็จ ต้องไม่ทำให้การบันทึกค่าใช้จ่ายของผู้ใช้ล้มตาม
 * แต่ต้อง "ดัง" พอในล็อกเซิร์ฟเวอร์ (บทเรียนเดียวกับ lib/audit.ts ที่เคยกลืน error
 * จนระบบ audit ไม่ทำงานเลยหลายเดือนโดยไม่มีใครรู้)
 */

export type MirrorExpenseInput = {
  /** id ของแถวใน sc_opex ที่เพิ่งสร้าง — ใช้จับคู่กันภายหลังและกัน backfill ซ้ำ */
  legacyOpexId: number | string;
  /** วันที่จ่ายจริง รูปแบบ YYYY-MM-DD */
  entryDate: string;
  amount: number;
  /** ค่าที่เก็บใน sc_opex.category (เป็น shortLabel) — จะถูกแปลงเป็น key ให้เอง */
  rawCategory: string;
  title: string;
  payMethod?: string;
  createdBy?: string | null;
  branchId?: string | null;
};

/** เขียนกระจกเงาของค่าใช้จ่ายหนึ่งรายการ — ไม่ throw ไม่ว่ากรณีใด */
export async function mirrorExpenseEntry(input: MirrorExpenseInput): Promise<void> {
  try {
    const legacyId = Number(input.legacyOpexId);
    if (!Number.isFinite(legacyId)) return;

    const amount = Number(input.amount);
    // constraint ฝั่งฐานข้อมูลจะปฏิเสธอยู่แล้ว แต่กันไว้ตรงนี้ด้วยเพื่อไม่ให้เกิด error
    // ที่ไม่จำเป็นในล็อก (เช่นแถวยอด 0 ที่ sc_opex ยอมรับได้แต่ตารางใหม่ไม่รับ)
    if (!(amount > 0) || amount >= 10_000_000) return;

    const supabase = createAdminClient();
    const { error } = await supabase.from("sc_expense_entries").insert({
      entry_date: input.entryDate,
      amount,
      category: categoryKeyFor(input.rawCategory, input.title),
      title: input.title,
      pay_method: input.payMethod || "บัญชีร้าน",
      legacy_opex_id: legacyId,
      created_by: input.createdBy ?? null,
      branch_id: input.branchId ?? null,
    });

    if (error) {
      // 23505 = unique violation → มีกระจกเงาอยู่แล้ว (เช่นกดบันทึกซ้ำ) ไม่ใช่ปัญหา
      if (error.code === "23505") return;
      console.error(
        `[expense-mirror] เขียน sc_expense_entries ไม่สำเร็จ (legacy_opex_id=${legacyId}): ${error.message}`
      );
    }
  } catch (err) {
    console.error("[expense-mirror] เขียนกระจกเงาล้มเหลว:", err);
  }
}

/** ลบกระจกเงาเมื่อแถวต้นทางใน sc_opex ถูกลบ — ไม่ throw ไม่ว่ากรณีใด */
export async function unmirrorExpenseEntry(legacyOpexId: number | string): Promise<void> {
  try {
    const legacyId = Number(legacyOpexId);
    if (!Number.isFinite(legacyId)) return;
    const supabase = createAdminClient();
    const { error } = await supabase.from("sc_expense_entries").delete().eq("legacy_opex_id", legacyId);
    if (error) {
      console.error(
        `[expense-mirror] ลบ sc_expense_entries ไม่สำเร็จ (legacy_opex_id=${legacyId}): ${error.message}`
      );
    }
  } catch (err) {
    console.error("[expense-mirror] ลบกระจกเงาล้มเหลว:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// กระจกเงาของสลิปเงินเดือน (ขั้นที่ 5 ของ docs/sc-opex-refactor-plan.md)
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ เจ้าของเลือก "ไม่สลับการอ่านเงินเดือน" (2026-09-08) หน้าเว็บจึงยังอ่านจาก `sc_opex`
// เหมือนเดิมทุกอย่าง — แต่ถ้าปล่อยให้ `sc_payslips` ค้างอยู่ที่ข้อมูลวันที่ backfill
// มันจะเก่าลงเรื่อยๆ ทุกครั้งที่มีคนบันทึกเงินเดือนใหม่ แล้วกลายเป็น "ตารางเงินที่ดูเหมือน
// ใช้ได้แต่ผิด" ซึ่งอันตรายกว่าไม่มีตารางเลย
//
// กระจกเงาตัวนี้จึงเขียนตามทุกครั้งที่บันทึกเงินเดือน เพื่อให้ตารางใหม่ตรงกับของจริงเสมอ
// พร้อมใช้ทันทีในวันที่เจ้าของตัดสินใจสลับการอ่าน · **ไม่มีหน้าไหนอ่านตารางนี้ตอนนี้**
// จึงไม่มีทางกระทบตัวเลขบนหน้าจอ และเช่นเดียวกับกระจกเงาค่าใช้จ่าย — **ห้าม throw เด็ดขาด**

export type MirrorPayslipInput = {
  month: string;              // "MM/YYYY"
  employeeName: string;
  baseSalary: number;
  diligence: number;
  ot: number;
  commissionPct: number;
  wht: number;
  deductionTotal: number;
  netPay: number;
  deductions: Array<{ name: string; amount: number }>;
  createdBy?: string | null;
};

/** เขียนกระจกเงาของสลิปเงินเดือนหนึ่งใบ — ไม่ throw ไม่ว่ากรณีใด */
export async function mirrorPayslip(input: MirrorPayslipInput): Promise<void> {
  try {
    if (!/^[0-9]{2}\/[0-9]{4}$/.test(input.month)) return;
    const employee = input.employeeName.trim();
    if (!employee) return;

    const supabase = createAdminClient();
    const legacyRef = `${input.month}|${employee}`;
    const clamp = (n: number) => {
      const v = Number(n);
      // constraint ฝั่งฐานข้อมูลจะปฏิเสธค่านอกช่วงอยู่แล้ว กันไว้ตรงนี้ด้วยเพื่อไม่ให้เกิด
      // error ที่ไม่จำเป็นในล็อกเซิร์ฟเวอร์
      return Number.isFinite(v) && v >= 0 && v < 10_000_000 ? v : 0;
    };

    const { data: saved, error } = await supabase
      .from("sc_payslips")
      .upsert(
        {
          month: input.month,
          employee_name: employee,
          base_salary: clamp(input.baseSalary),
          diligence: clamp(input.diligence),
          ot: clamp(input.ot),
          commission_pct: Math.min(100, Math.max(0, Number(input.commissionPct) || 0)),
          wht: clamp(input.wht),
          deduction_total: clamp(input.deductionTotal),
          net_pay: clamp(input.netPay),
          legacy_ref: legacyRef,
          created_by: input.createdBy ?? null,
        },
        // ⚠️ ต้องชี้ไปที่ constraint จริง ไม่ใช่ partial unique index ของ legacy_ref
        // (Postgres ใช้ partial index อนุมาน ON CONFLICT ไม่ได้)
        { onConflict: "month,employee_name" }
      )
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(`[payslip-mirror] เขียน sc_payslips ไม่สำเร็จ (${legacyRef}): ${error.message}`);
      return;
    }
    if (!saved?.id) return;

    // รายการหักเป็นชุด — ลบของเดิมทั้งหมดแล้วเขียนใหม่ ง่ายกว่าไล่เทียบทีละรายการ
    // และปลอดภัยเพราะตารางนี้ยังไม่มีใครอ่าน
    await supabase.from("sc_payslip_deductions").delete().eq("payslip_id", saved.id);
    const rows = input.deductions
      .filter((d) => d.name?.trim() && Number(d.amount) > 0)
      .map((d, idx) => ({
        payslip_id: saved.id,
        name: d.name.trim(),
        amount: Number(d.amount),
        legacy_ref: `${legacyRef}|new-${idx}`,
      }));
    if (rows.length > 0) {
      const { error: dErr } = await supabase.from("sc_payslip_deductions").insert(rows);
      if (dErr) console.error(`[payslip-mirror] เขียนรายการหักไม่สำเร็จ (${legacyRef}): ${dErr.message}`);
    }
  } catch (err) {
    console.error("[payslip-mirror] เขียนกระจกเงาสลิปล้มเหลว:", err);
  }
}
