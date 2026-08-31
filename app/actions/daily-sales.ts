"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";

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
  const supabase = createAdminClient();

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
  const { data: existingAr } = await (supabase.from("sc_payments" as any) as any)
    .select("amount")
    .eq("sale_date", data.date);

  const arPaidSum = (existingAr || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
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

  const payload: Record<string, any> = {
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
  };

  let error;
  if (data.id) {
    const res = await (supabase.from("sc_sales" as any) as any)
      .update(payload)
      .eq("id", data.id);
    error = res.error;
  } else {
    const res = await (supabase.from("sc_sales" as any) as any).insert(payload);
    error = res.error;
  }

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  revalidatePath("/reports");
  revalidatePath("/pos");
  revalidatePath("/pos/daily-entry");

  return { success: true };
}

export async function deleteDailySale(id: number) {
  await requireProfile();
  const supabase = createAdminClient();

  const { error } = await (supabase.from("sc_sales" as any) as any)
    .delete()
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  revalidatePath("/reports");
  revalidatePath("/pos");
  revalidatePath("/pos/daily-entry");

  return { success: true };
}

export async function fetchRecentDailySales(limit: number = 300): Promise<DailySaleWithPayments[]> {
  await requireProfile();
  const supabase = createAdminClient();

  const [{ data: salesData, error: salesError }, { data: paymentsData }] = await Promise.all([
    (supabase.from("sc_sales" as any) as any)
      .select("*")
      .order("date", { ascending: false })
      .limit(limit),
    (supabase.from("sc_payments" as any) as any)
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  if (salesError || !salesData) return [];

  const paymentsByDate = new Map<string, ArPaymentRecord[]>();
  (paymentsData || []).forEach((p: any) => {
    const list = paymentsByDate.get(p.sale_date) || [];
    list.push(p);
    paymentsByDate.set(p.sale_date, list);
  });

  return salesData.map((s: any) => {
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
      created_at: s.created_at,
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
}) {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  if (!data.sale_date || !data.received_date || Number(data.amount) <= 0) {
    return { success: false, error: "กรุณาระบุข้อมูลวันที่และจำนวนเงินให้ถูกต้อง" };
  }

  const paymentPayload = {
    sale_date: data.sale_date,
    received_date: data.received_date,
    amount: Number(data.amount),
    pay_method: data.pay_method || "โอน",
    notes: data.notes || "",
    recorded_by: profile.display_name || profile.username || "Staff",
  };

  const { error: paymentError } = await (supabase.from("sc_payments" as any) as any).insert(paymentPayload);
  if (paymentError) {
    return { success: false, error: paymentError.message };
  }

  // Update sale status in sc_sales
  const { data: sale } = await (supabase.from("sc_sales" as any) as any)
    .select("*")
    .eq("date", data.sale_date)
    .maybeSingle();

  if (sale) {
    const { data: allAr } = await (supabase.from("sc_payments" as any) as any)
      .select("amount")
      .eq("sale_date", data.sale_date);

    const totalAr = (allAr || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    const initialPaid = Number(
      sale.amount_paid !== undefined
        ? sale.amount_paid
        : (Number(sale.cash_amount || 0) + Number(sale.transfer_amount || 0))
    );
    const netRevenue = Number(sale.total_revenue || (Number(sale.grand_total || 0) - Number(sale.discount || 0)));
    const totalPaidAll = initialPaid + totalAr;

    const newStatus = totalPaidAll >= netRevenue ? "ชำระครบ" : "ค้างชำระ";
    await (supabase.from("sc_sales" as any) as any)
      .update({
        payment_status: newStatus,
        last_updated: new Date().toISOString(),
      })
      .eq("id", sale.id);
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
  await requireProfile();
  const supabase = createAdminClient();

  const { error } = await (supabase.from("sc_payments" as any) as any)
    .delete()
    .eq("id", paymentId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Recalculate status in sc_sales
  const { data: sale } = await (supabase.from("sc_sales" as any) as any)
    .select("*")
    .eq("date", saleDate)
    .maybeSingle();

  if (sale) {
    const { data: allAr } = await (supabase.from("sc_payments" as any) as any)
      .select("amount")
      .eq("sale_date", saleDate);

    const totalAr = (allAr || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    const initialPaid = Number(
      sale.amount_paid !== undefined
        ? sale.amount_paid
        : (Number(sale.cash_amount || 0) + Number(sale.transfer_amount || 0))
    );
    const netRevenue = Number(sale.total_revenue || (Number(sale.grand_total || 0) - Number(sale.discount || 0)));
    const totalPaidAll = initialPaid + totalAr;

    const newStatus = totalPaidAll >= netRevenue ? "ชำระครบ" : "ค้างชำระ";
    await (supabase.from("sc_sales" as any) as any)
      .update({
        payment_status: newStatus,
        last_updated: new Date().toISOString(),
      })
      .eq("id", sale.id);
  }

  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  revalidatePath("/reports");
  revalidatePath("/pos");
  revalidatePath("/pos/daily-entry");

  return { success: true };
}
