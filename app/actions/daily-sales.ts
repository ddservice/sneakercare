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

  // Derive payment status if not explicitly passed
  let paymentStatus = data.payment_status;
  if (!paymentStatus) {
    if (actualPaid >= netTotal && netTotal > 0) {
      paymentStatus = "ชำระครบ";
    } else if (actualPaid > 0) {
      paymentStatus = "ชำระบางส่วน";
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

export async function fetchRecentDailySales(limit: number = 30) {
  await requireProfile();
  const supabase = createAdminClient();

  const { data, error } = await (supabase.from("sc_sales" as any) as any)
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);

  if (error) return [];
  return data || [];
}
