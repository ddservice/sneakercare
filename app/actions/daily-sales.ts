"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import type { Database } from "@/lib/supabase/database.types";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { isIdempotentReplay } from "@/lib/idempotency";
import { assertPeriodOpen } from "@/lib/period-close-store";

export type DailySaleInput = {
  id?: number;
  date: string;
  size_s: number;
  size_m: number;
  size_l: number;
  size_xl: number;
  cash_amount: number;
  transfer_amount: number;
  amount_paid?: number;
  discount?: number;
  gross_amount?: number;
  grand_total?: number;
  extra_items?: string;
  payment_status?: string;
  clientRequestId?: string;
  /** ใบรับงานจาก /pos เท่านั้น — ยอดขายรายวันห้ามใส่ */
  serviceOrderId?: string;
};

export type ArPaymentRecord = {
  id: number;
  sale_date: string;
  received_date: string;
  amount: number;
  pay_method: string;
  notes?: string;
  recorded_by?: string;
  created_at?: string;
};

export type DailySaleWithPayments = {
  id: number;
  date: string;
  size_s: number;
  size_m: number;
  size_l: number;
  size_xl: number;
  cash_amount: number;
  transfer_amount: number;
  amount_paid: number;
  discount: number;
  grand_total: number;
  total_revenue: number;
  payment_status: string;
  extra_items?: string;
  recorded_by?: string;
  created_at?: string;
  payments: ArPaymentRecord[];
  total_ar_paid: number;
  total_paid: number;
  outstanding: number;
};

export async function saveDailySale(data: DailySaleInput) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  const supabase = createAdminClient();
  // ⚠️ ใช้ service_role — bypass RLS ทั้งหมด ต้องกรอง/ระบุ tenant_id เองทุกจุดในไฟล์นี้
  const tenantId = await requireTenantId(profile);
  const closedErr = await assertPeriodOpen(tenantId, data.date);
  if (closedErr) return { success: false, error: closedErr };

  const cash = Number(data.cash_amount || 0);
  const transfer = Number(data.transfer_amount || 0);
  const actualPaid = data.amount_paid !== undefined ? Number(data.amount_paid) : cash + transfer;
  const discount = Number(data.discount || 0);

  // Calculate gross from sizes (S:200, M:400, L:600, XL:800) + extra if not specified
  const sizeS = Number(data.size_s || 0);
  const sizeM = Number(data.size_m || 0);
  const sizeL = Number(data.size_l || 0);
  const sizeXL = Number(data.size_xl || 0);
  const sizeGross = sizeS * 200 + sizeM * 400 + sizeL * 600 + sizeXL * 800;

  const grossTotal = data.gross_amount !== undefined && data.gross_amount > 0
    ? Number(data.gross_amount)
    : sizeGross;

  const netTotal = data.grand_total !== undefined && data.grand_total > 0
    ? Number(data.grand_total)
    : Math.max(0, grossTotal - discount);

  // Check if there are existing AR payments in sc_payments for this sale date
  const { data: existingAr } = await supabase.from("sc_payments")
    .select("amount")
    .eq("sale_date", data.date)
    .eq("tenant_id", tenantId);

  const arPaidSum = (existingAr || []).reduce((sum: number, p) => sum + Number(p.amount || 0), 0);
  const totalPaidAll = actualPaid + arPaidSum;

  // Derive payment status strictly to 'ชำระครบ' vs 'ค้างชำระ' (matching legacy 100%)
  let paymentStatus = data.payment_status;
  if (!paymentStatus || paymentStatus === "ชำระบางส่วน") {
    if (totalPaidAll >= netTotal && netTotal > 0) {
      paymentStatus = "ชำระครบ";
    } else {
      paymentStatus = "ค้างชำระ";
    }
  }

  // ⚠️ (แก้ 2026-09-06) เดิมเป็น `Record<string, any>` ซึ่งทำให้ TypeScript ตรวจชื่อคอลัมน์ไม่ได้เลย
  // ผูกกับชนิดจริงของตาราง sc_sales แทน — พิมพ์ชื่อคอลัมน์ผิดจะขึ้น error ทันทีตั้งแต่ตอน build
  const payload: Database["public"]["Tables"]["sc_sales"]["Insert"] = {
    date: data.date,
    size_s: sizeS,
    size_m: sizeM,
    size_l: sizeL,
    size_xl: sizeXL,
    cash_amount: cash,
    transfer_amount: transfer,
    discount: discount,
    total_revenue: netTotal,
    grand_total: grossTotal,
    amount_paid: actualPaid,
    payment_status: paymentStatus,
    extra_items: data.extra_items || "",
    recorded_by: profile.display_name || profile.username || "Staff",
    last_updated: new Date().toISOString(),
    tenant_id: tenantId,
    ...(!data.id && data.clientRequestId ? { client_request_id: data.clientRequestId } : {}),
    ...(!data.id && data.serviceOrderId ? { service_order_id: data.serviceOrderId } : {}),
  };

  // เก็บค่าเดิมไว้ก่อนแก้ เพื่อให้ audit log บอกได้ว่าอะไรเปลี่ยนจากอะไรเป็นอะไร
  let before: Record<string, unknown> | null = null;
  if (data.id) {
    const { data: prev } = await supabase.from("sc_sales")
      .select("date, total_revenue, grand_total, discount, amount_paid, payment_status")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    before = prev ?? null;
    if (before?.date && String(before.date) !== data.date) {
      const prevClosed = await assertPeriodOpen(tenantId, String(before.date));
      if (prevClosed) return { success: false, error: prevClosed };
    }
  }

  let error;
  let savedId: number | undefined = data.id;
  if (data.id) {
    // ⚠️ ต้อง .eq("tenant_id", ...) ด้วยเสมอ ไม่งั้นถ้า id เป็นของ tenant อื่น (เดา/หลุดมา)
    // update จะไปแก้แถวของ tenant อื่นได้ตรงๆ เพราะ service_role ไม่ผ่าน RLS
    const res = await supabase.from("sc_sales")
      .update(payload)
      .eq("id", data.id)
      .eq("tenant_id", tenantId);
    error = res.error;
  } else {
    const res = await supabase.from("sc_sales")
      .insert(payload)
      .select("id")
      .maybeSingle();
    error = res.error;
    savedId = res.data?.id;
  }

  if (error) {
    if (!data.id && isIdempotentReplay(error)) {
      return { success: true };
    }
    return { success: false, error: error.message };
  }

  await logAudit({
    action: data.id ? "UPDATE" : "CREATE",
    entity: "daily_sale",
    entity_id: savedId,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: {
      date: data.date,
      total_revenue: netTotal,
      grand_total: grossTotal,
      discount,
      amount_paid: actualPaid,
      payment_status: paymentStatus,
      ...(before ? { before } : {}),
    },
  });

  revalidatePath("/", "layout");

  return { success: true };
}

export async function deleteDailySale(id: number) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  const supabase = createAdminClient();
  const tenantId = await requireTenantId(profile);

  // อ่านแถวเก็บไว้ก่อน เพราะพอลบแล้วไม่มีทางรู้ย้อนหลังว่ายอดที่หายไปคือเท่าไหร่
  const { data: doomed } = await supabase.from("sc_sales")
    .select("date, total_revenue, grand_total, discount, amount_paid, payment_status, recorded_by")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (doomed?.date) {
    const closedErr = await assertPeriodOpen(tenantId, doomed.date);
    if (closedErr) return { success: false, error: closedErr };
  }

  // ⚠️ .eq("tenant_id", ...) กัน id ของ tenant อื่นถูกลบข้ามฝั่ง
  const { error } = await supabase.from("sc_sales")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: "DELETE",
    entity: "daily_sale",
    entity_id: id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: doomed
      ? { sale_id: id, ...doomed }
      : { sale_id: id, note: "อ่านข้อมูลเดิมไม่ได้ก่อนลบ" },
  });

  revalidatePath("/", "layout");

  return { success: true };
}

/** นับยอดขายรายวันทั้งหมด — ใช้บอกผู้ใช้ว่าหน้าจอกำลังแสดงไม่ครบ */
export async function countDailySales(): Promise<number> {
  const profile = await requireProfile();
  requireModuleView(profile, "pos");
  const supabase = createAdminClient();
  const tenantId = await tenantFilter(profile);
  let query = supabase.from("sc_sales").select("id", {
    count: "exact",
    head: true,
  });
  if (tenantId) query = query.eq("tenant_id", tenantId);
  const { count } = await query;
  return count ?? 0;
}

export async function fetchRecentDailySales(limit: number = 300): Promise<DailySaleWithPayments[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "pos");
  const supabase = createAdminClient();
  const tenantId = await tenantFilter(profile);

  let salesQuery = supabase.from("sc_sales")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);
  if (tenantId) salesQuery = salesQuery.eq("tenant_id", tenantId);
  const { data: salesData, error: salesError } = await salesQuery;

  if (salesError || !salesData) return [];

  // ดึงเฉพาะใบรับชำระของวันที่โหลดมาจริง — ของเดิม select ทั้งตาราง sc_payments
  // โดยไม่มี limit ซึ่งจะโตไม่มีเพดานไปเรื่อยๆ ตามจำนวนงวดที่เก็บเงินย้อนหลัง
  // ⚠️ ต้องกรอง tenant_id ด้วย ไม่ใช่แค่ .in("sale_date", ...) — วันที่ไม่ใช่ค่าที่ผูกกับ
  // tenant เดียว สองธุรกิจอาจมี "ยอดขายวันที่เดียวกัน" ได้ตามปกติ
  const loadedDates = [...new Set(salesData.map((s) => s.date))];
  let paymentsQuery = supabase.from("sc_payments")
    .select("*")
    .in("sale_date", loadedDates)
    .order("created_at", { ascending: false });
  if (tenantId) paymentsQuery = paymentsQuery.eq("tenant_id", tenantId);
  const { data: paymentsData } = loadedDates.length
    ? await paymentsQuery
    // ให้ชนิดตรงกับผลลัพธ์ของ query ด้านบน แทน any[] เพื่อให้ TypeScript ตรวจการใช้งานต่อได้จริง
    : { data: [] as Database["public"]["Tables"]["sc_payments"]["Row"][] };

  const paymentsByDate = new Map<string, ArPaymentRecord[]>();
  (paymentsData || []).forEach((p) => {
    const list = paymentsByDate.get(p.sale_date) || [];
    // คอลัมน์ในฐานข้อมูลเป็น nullable แต่ ArPaymentRecord ที่ฝั่ง UI ใช้ต้องการค่าแน่นอน —
    // เติมค่าสำรองตรงนี้จุดเดียว แทนที่จะปล่อย null ไปให้ทุกที่ที่ใช้ต้องมาเช็คเอง
    list.push({
      id: p.id,
      sale_date: p.sale_date,
      received_date: p.received_date,
      amount: Number(p.amount ?? 0),
      pay_method: p.pay_method ?? "",
      notes: p.notes ?? undefined,
      recorded_by: p.recorded_by ?? undefined,
      created_at: p.created_at ?? undefined,
    });
    paymentsByDate.set(p.sale_date, list);
  });

  return salesData.map((s) => {
    const payments = paymentsByDate.get(s.date) || [];
    const arPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const initialPaid = Number(
      s.amount_paid !== undefined
        ? s.amount_paid
        : (Number(s.cash_amount || 0) + Number(s.transfer_amount || 0))
    );
    const netRevenue = Number(s.total_revenue || (Number(s.grand_total || 0) - Number(s.discount || 0)));
    const totalPaid = initialPaid + arPaid;
    const outstanding = Math.max(0, netRevenue - totalPaid);

    let status = s.payment_status || "ชำระครบ";
    if (outstanding <= 0 && netRevenue > 0) {
      status = "ชำระครบ";
    } else if (outstanding > 0) {
      status = "ค้างชำระ";
    }

    return {
      id: s.id,
      date: s.date,
      size_s: Number(s.size_s || 0),
      size_m: Number(s.size_m || 0),
      size_l: Number(s.size_l || 0),
      size_xl: Number(s.size_xl || 0),
      cash_amount: Number(s.cash_amount || 0),
      transfer_amount: Number(s.transfer_amount || 0),
      amount_paid: initialPaid,
      discount: Number(s.discount || 0),
      grand_total: Number(s.grand_total || 0),
      total_revenue: netRevenue,
      payment_status: status,
      extra_items: s.extra_items || "",
      recorded_by: s.recorded_by || "Staff",
      // คอลัมน์ในฐานข้อมูลเป็น nullable ส่วน type ฝั่งแอปใช้ optional — แปลง null เป็น undefined
      created_at: s.created_at ?? undefined,
      payments,
      total_ar_paid: arPaid,
      total_paid: totalPaid,
      outstanding,
    };
  });
}

/**
 * Record an Accounts Receivable (AR) Payment for an outstanding sale date
 */
export async function recordArPayment(data: {
  sale_date: string;
  received_date: string;
  amount: number;
  pay_method: string;
  notes?: string;
  clientRequestId?: string;
}) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  const supabase = createAdminClient();
  const tenantId = await requireTenantId(profile);

  if (!data.sale_date || !data.received_date || Number(data.amount) <= 0) {
    return { success: false, error: "กรุณาระบุข้อมูลวันที่และจำนวนเงินให้ถูกต้อง" };
  }

  const closedErr = await assertPeriodOpen(tenantId, data.sale_date);
  if (closedErr) return { success: false, error: closedErr };

  const paymentPayload: Database["public"]["Tables"]["sc_payments"]["Insert"] = {
    sale_date: data.sale_date,
    received_date: data.received_date,
    amount: Number(data.amount),
    pay_method: data.pay_method || "โอน",
    notes: data.notes || "",
    recorded_by: profile.display_name || profile.username || "Staff",
    tenant_id: tenantId,
    ...(data.clientRequestId ? { client_request_id: data.clientRequestId } : {}),
  };

  const { data: inserted, error: paymentError } = await supabase.from("sc_payments")
    .insert(paymentPayload)
    .select("id")
    .maybeSingle();
  if (paymentError) {
    if (isIdempotentReplay(paymentError)) {
      return { success: true };
    }
    return { success: false, error: paymentError.message };
  }

  await logAudit({
    action: "CREATE",
    entity: "ar_payment",
    entity_id: inserted?.id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: paymentPayload,
  });

  // Update sale status in sc_sales
  // ⚠️ .eq("tenant_id", ...) จำเป็น ไม่ใช่แค่ .eq("date", ...) — วันที่ไม่ใช่ค่าที่ผูกกับ
  // tenant เดียว ถ้าไม่กรอง อาจไปอัปเดตสถานะยอดขายของอีกธุรกิจที่บังเอิญขายวันเดียวกัน
  const { data: sale } = await supabase.from("sc_sales")
    .select("*")
    .eq("date", data.sale_date)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (sale) {
    const { data: allAr } = await supabase.from("sc_payments")
      .select("amount")
      .eq("sale_date", data.sale_date)
      .eq("tenant_id", tenantId);

    const totalAr = (allAr || []).reduce((sum: number, p) => sum + Number(p.amount || 0), 0);
    const initialPaid = Number(
      sale.amount_paid !== undefined
        ? sale.amount_paid
        : (Number(sale.cash_amount || 0) + Number(sale.transfer_amount || 0))
    );
    const netRevenue = Number(sale.total_revenue || (Number(sale.grand_total || 0) - Number(sale.discount || 0)));
    const totalPaidAll = initialPaid + totalAr;

    const newStatus = totalPaidAll >= netRevenue ? "ชำระครบ" : "ค้างชำระ";
    // sale.id มาจาก query ที่กรอง tenant_id แล้วข้างบน แต่ใส่ซ้ำอีกชั้นเป็น defense-in-depth
    await supabase.from("sc_sales")
      .update({
        payment_status: newStatus,
        last_updated: new Date().toISOString(),
      })
      .eq("id", sale.id)
      .eq("tenant_id", tenantId);
  }

  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  revalidatePath("/reports");
  revalidatePath("/pos");
  revalidatePath("/pos/daily-entry");

  return { success: true };
}

/**
 * Delete an AR Payment receipt
 */
export async function deleteArPayment(paymentId: number, saleDate: string) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  const supabase = createAdminClient();
  const tenantId = await requireTenantId(profile);

  // อ่านใบรับชำระเก็บไว้ก่อนลบ — ยอดเงินที่หายต้องตรวจย้อนหลังได้
  const { data: doomed } = await supabase.from("sc_payments")
    .select("sale_date, received_date, amount, pay_method, notes, recorded_by")
    .eq("id", paymentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const closedErr = await assertPeriodOpen(tenantId, doomed?.sale_date ?? saleDate);
  if (closedErr) return { success: false, error: closedErr };

  // ⚠️ .eq("tenant_id", ...) กัน id ของ tenant อื่นถูกลบข้ามฝั่ง
  const { error } = await supabase.from("sc_payments")
    .delete()
    .eq("id", paymentId)
    .eq("tenant_id", tenantId);

  if (error) {
    return { success: false, error: error.message };
  }

  await logAudit({
    action: "DELETE",
    entity: "ar_payment",
    entity_id: paymentId,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: { payment_id: paymentId, sale_date: saleDate, ...(doomed ?? {}) },
  });

  // Recalculate status in sc_sales
  const { data: sale } = await supabase.from("sc_sales")
    .select("*")
    .eq("date", saleDate)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (sale) {
    const { data: allAr } = await supabase.from("sc_payments")
      .select("amount")
      .eq("sale_date", saleDate)
      .eq("tenant_id", tenantId);

    const totalAr = (allAr || []).reduce((sum: number, p) => sum + Number(p.amount || 0), 0);
    const initialPaid = Number(
      sale.amount_paid !== undefined
        ? sale.amount_paid
        : (Number(sale.cash_amount || 0) + Number(sale.transfer_amount || 0))
    );
    const netRevenue = Number(sale.total_revenue || (Number(sale.grand_total || 0) - Number(sale.discount || 0)));
    const totalPaidAll = initialPaid + totalAr;

    const newStatus = totalPaidAll >= netRevenue ? "ชำระครบ" : "ค้างชำระ";
    await supabase.from("sc_sales")
      .update({
        payment_status: newStatus,
        last_updated: new Date().toISOString(),
      })
      .eq("id", sale.id)
      .eq("tenant_id", tenantId);
  }

  revalidatePath("/", "layout");

  return { success: true };
}
