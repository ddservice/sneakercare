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
  discount?: number;
  grand_total?: number;
  extra_items?: string;
  payment_status?: string;
};

export async function saveDailySale(data: DailySaleInput) {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  const totalCalculated =
    Number(data.cash_amount || 0) + Number(data.transfer_amount || 0);

  const grandTotal =
    data.grand_total !== undefined && data.grand_total > 0
      ? Number(data.grand_total)
      : totalCalculated;

  const payload: any = {
    date: data.date,
    size_s: Number(data.size_s || 0),
    size_m: Number(data.size_m || 0),
    size_l: Number(data.size_l || 0),
    size_xl: Number(data.size_xl || 0),
    cash_amount: Number(data.cash_amount || 0),
    transfer_amount: Number(data.transfer_amount || 0),
    discount: Number(data.discount || 0),
    total_revenue: grandTotal + Number(data.discount || 0),
    grand_total: grandTotal,
    amount_paid: grandTotal,
    payment_status: data.payment_status || "ชำระครบ",
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
