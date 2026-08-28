"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";

export type PosActionState = {
  error?: string;
  success?: boolean;
  orderNo?: string;
} | undefined;

export async function createServiceOrder(
  _prev: PosActionState,
  formData: FormData
): Promise<PosActionState> {
  const profile = await requireProfile();
  const selectedBranchId = await getSelectedBranchId(profile);

  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerPhone = String(formData.get("customer_phone") ?? "").trim();
  const shoeBrand = String(formData.get("shoe_brand") ?? "").trim();
  const shoeModel = String(formData.get("shoe_model") ?? "").trim();
  const shoeColor = String(formData.get("shoe_color") ?? "").trim();
  const shoeSize = String(formData.get("shoe_size") ?? "M").trim();
  const serviceIdsRaw = formData.getAll("service_items");
  const grossAmount = Number(formData.get("gross_amount") ?? 0);
  const discountAmount = Number(formData.get("discount_amount") ?? 0);
  const netAmount = Number(formData.get("net_amount") ?? 0);
  const cashAmount = Number(formData.get("cash_amount") ?? 0);
  const transferAmount = Number(formData.get("transfer_amount") ?? 0);
  const paymentMethod = String(formData.get("payment_method") ?? "cash") as "cash" | "transfer" | "credit" | "unpaid";
  const notes = String(formData.get("notes") ?? "").trim();

  if (!customerName || !customerPhone) {
    return { error: "กรุณากรอกชื่อและเบอร์โทรศัพท์ของลูกค้า" };
  }

  if (netAmount < 0) {
    return { error: "ยอดสุทธิไม่ถูกต้อง" };
  }

  const supabase = await createClient();

  // 1. Create or update customer record
  let customerId: string | null = null;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", customerPhone)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
    await supabase
      .from("customers")
      .update({ name: customerName, updated_at: new Date().toISOString() })
      .eq("id", customerId);
  } else {
    const { data: newCustomer } = await supabase
      .from("customers")
      .insert({
        name: customerName,
        phone: customerPhone,
        branch_id: selectedBranchId,
      })
      .select("id")
      .single();
    if (newCustomer) customerId = newCustomer.id;
  }

  // 2. Generate Order No (e.g. SC-260828-001)
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, "");
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const orderNo = `SC-${dateStr}-${randomSuffix}`;

  // 3. Insert Service Order
  const { data: order, error: orderError } = await supabase
    .from("service_orders")
    .insert({
      order_no: orderNo,
      branch_id: selectedBranchId,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      shoe_brand: shoeBrand || null,
      shoe_model: shoeModel || null,
      shoe_color: shoeColor || null,
      shoe_size: shoeSize || "M",
      status: "received",
      payment_method: paymentMethod,
      gross_amount: grossAmount,
      discount_amount: discountAmount,
      net_amount: netAmount,
      cash_amount: cashAmount,
      transfer_amount: transferAmount,
      is_paid: paymentMethod !== "unpaid",
      notes: notes || null,
      received_by: profile.id,
      received_at: now.toISOString(),
    })
    .select("id")
    .single();

  if (orderError || !order) {
    return { error: `บันทึกรับงานไม่สำเร็จ: ${orderError?.message ?? "ไม่สามารถสร้างรายการได้"}` };
  }

  // 4. Insert service items if any
  if (serviceIdsRaw.length > 0) {
    const itemsToInsert = serviceIdsRaw.map((itemStr) => {
      try {
        const item = JSON.parse(String(itemStr));
        return {
          order_id: order.id,
          service_id: item.id || null,
          service_name: item.name,
          price: Number(item.price ?? 0),
          quantity: 1,
        };
      } catch {
        return {
          order_id: order.id,
          service_name: String(itemStr),
          price: 0,
          quantity: 1,
        };
      }
    });

    await supabase.from("service_order_items").insert(itemsToInsert);
  }

  revalidatePath("/pos");
  revalidatePath("/dashboard");
  return { success: true, orderNo };
}

export async function updateOrderStatus(orderId: string, status: "received" | "in_progress" | "ready" | "delivered" | "cancelled") {
  const profile = await requireProfile();
  const supabase = await createClient();

  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === "ready") {
    updatePayload.completed_at = new Date().toISOString();
  } else if (status === "delivered") {
    updatePayload.delivered_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from("service_orders")
    .update(updatePayload)
    .eq("id", orderId);

  if (error) {
    throw new Error(`ไม่สามารถอัปเดตสถานะได้: ${error.message}`);
  }

  revalidatePath("/pos");
  revalidatePath("/dashboard");
  return { success: true };
}
