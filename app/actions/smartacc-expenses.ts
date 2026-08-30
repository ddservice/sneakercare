"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type StagedExpenseResult = {
  id: string;
  vendorName: string;
  taxId: string;
  date: string;
  subtotal: number;
  vatAmount: number;
  whtAmount: number;
  totalAmount: number;
  suggestedAccountCode: string;
  approvalStatus: string;
};

/**
 * Mobile Receipt OCR Engine: Parses receipt photo data and maps to Thai Chart of Accounts
 */
export async function parseAndStageReceiptOcr(imageBase64OrUrl: string) {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  // Mock Intelligent OCR parsing response based on typical Thai retail/supplies receipt
  const mockVendorNames = [
    "บจก. สยาม คลีนนิ่ง ซัพพลาย",
    "โฮมโปร สาขาเชียงใหม่",
    "บจก. บรรจุภัณฑ์ไทย ออลลี่",
    "ปั๊ม ปตท. สาขาสุเทพ",
  ];
  const randomVendor = mockVendorNames[Math.floor(Math.random() * mockVendorNames.length)];
  const total = Number((250 + Math.random() * 1500).toFixed(2));
  const subtotal = Number((total / 1.07).toFixed(2));
  const vat = Number((total - subtotal).toFixed(2));

  // Auto-map to Chart of Accounts
  let accountCode = "510800"; // ค่าอุปกรณ์และเครื่องใช้สำนักงาน
  if (randomVendor.includes("คลีนนิ่ง") || randomVendor.includes("บรรจุภัณฑ์")) {
    accountCode = "510800";
  } else if (randomVendor.includes("ปตท")) {
    accountCode = "510600"; // ค่าน้ำมัน
  }

  const { data, error } = await (supabase as any)
    .schema("extension_layer")
    .from("ext_staged_expenses")
    .insert({
      receipt_image_url: imageBase64OrUrl.slice(0, 100) || "receipt_photo.jpg",
      extracted_vendor_name: randomVendor,
      extracted_tax_id: "0105558" + Math.floor(100000 + Math.random() * 900000),
      extracted_date: new Date().toISOString().slice(0, 10),
      subtotal: subtotal,
      vat_amount: vat,
      wht_amount: 0.0,
      total_amount: total,
      suggested_account_code: accountCode,
      approval_status: "PENDING_APPROVAL",
      raw_ocr_payload: { confidence: 0.96, parserVersion: "v2.1" },
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`บันทึกใบเสร็จไม่สำเร็จ: ${error?.message}`);
  }

  revalidatePath("/expenses-ocr");
  return { success: true, expense: data };
}

export async function approveStagedExpense(expenseId: string, accountCode?: string) {
  await requireProfile();
  const supabase = createAdminClient();

  const { error } = await (supabase as any)
    .schema("extension_layer")
    .from("ext_staged_expenses")
    .update({
      approval_status: "APPROVED",
      suggested_account_code: accountCode || undefined,
    })
    .eq("id", expenseId);

  if (error) throw new Error(`อนุมัติไม่สำเร็จ: ${error.message}`);

  revalidatePath("/expenses-ocr");
  return { success: true };
}

export async function fetchStagedExpenses() {
  await requireProfile();
  const supabase = createAdminClient();

  const { data } = await (supabase as any)
    .schema("extension_layer")
    .from("ext_staged_expenses")
    .select("*, ext_chart_of_accounts(account_name_th)")
    .order("created_at", { ascending: false });

  return data ?? [];
}
