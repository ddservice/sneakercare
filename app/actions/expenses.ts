"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

export type ExpenseActionState = {
  error?: string;
  success?: boolean;
} | undefined;

export async function addExpense(
  _prev: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);

  const category = String(formData.get("category") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const expenseDate = String(formData.get("expense_date") ?? "").trim() || new Date().toISOString().slice(0, 10);
  const note = String(formData.get("note") ?? "").trim();

  if (!category || !title || amount <= 0) {
    return { error: "กรุณากรอกหมวดหมู่ รายการ และจำนวนเงินที่มากกว่า 0" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    branch_id: selectedBranchId,
    category,
    title,
    amount,
    expense_date: expenseDate,
    note: note || null,
    created_by: profile.id,
  });

  if (error) {
    return { error: `บันทึกค่าใช้จ่ายไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteExpense(expenseId: string) {
  const profile = await requireProfile();
  if (profile.role !== "admin" && profile.role !== "co_admin") {
    throw new Error("ไม่มีสิทธิ์ลบรายการค่าใช้จ่าย");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);

  if (error) {
    throw new Error(`ลบรายการไม่สำเร็จ: ${error.message}`);
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  return { success: true };
}
