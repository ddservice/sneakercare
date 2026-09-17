"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleWrite } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit";
import { requireTenantId } from "@/lib/tenant";
import { errorMessage } from "@/lib/errors";
import { isYmd, receivedAtFromYmd, ymdToOrderDateCode } from "@/lib/local-date";

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
  requireModuleWrite(profile, "pos");
  const selectedBranchId = await getSelectedBranchId(profile);

  let tenantId: string;
  try {
    tenantId = await requireTenantId(profile);
  } catch (err) {
    return { error: errorMessage(err, "กรุณาเลือกสาขาของกิจการก่อนรับงาน") };
  }

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
  const receivedDate = String(formData.get("received_date") ?? "").trim();

  if (!customerName || !customerPhone) {
    return { error: "กรุณากรอกชื่อและเบอร์โทรศัพท์ของลูกค้า" };
  }

  if (!isYmd(receivedDate)) {
    return { error: "กรุณาเลือกวันที่รับงาน" };
  }

  if (netAmount < 0) {
    return { error: "ยอดสุทธิไม่ถูกต้อง" };
  }

  const supabase = await createClient();
  const receivedAt = receivedAtFromYmd(receivedDate);

  // 1. Create or update customer record
  let customerId: string | null = null;
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("phone", customerPhone)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (existingCustomer) {
    customerId = existingCustomer.id;
    await supabase
      .from("customers")
      .update({ name: customerName, updated_at: new Date().toISOString() })
      .eq("id", customerId)
      .eq("tenant_id", tenantId);
  } else {
    const { data: newCustomer } = await supabase
      .from("customers")
      .insert({
        name: customerName,
        phone: customerPhone,
        tenant_id: tenantId,
      })
      .select("id")
      .single();
    if (newCustomer) customerId = newCustomer.id;
  }

  // 2. Generate Order No จากวันที่ที่กรอก ไม่ใช่ UTC ของเซิร์ฟเวอร์
  const dateStr = ymdToOrderDateCode(receivedDate);
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  const orderNo = `SC-${dateStr}-${randomSuffix}`;

  // 3. Insert Service Order
  const { data: order, error: orderError } = await supabase
    .from("service_orders")
    .insert({
      order_no: orderNo,
      branch_id: selectedBranchId,
      tenant_id: tenantId,
      customer_id: customerId,
      customer_name: customerName,
      customer_phone: customerPhone,
      shoe_brand: shoeBrand || null,
      shoe_model: shoeModel || null,
      shoe_color: shoeColor || null,
      shoe_size: shoeSize || "M",
      status: "received",
      payment_method: paymentMethod,
      total_amount: grossAmount,
      discount_amount: discountAmount,
      net_amount: netAmount,
      cash_amount: cashAmount,
      transfer_amount: transferAmount,
      payment_status: paymentMethod !== "unpaid" ? "paid" : "unpaid",
      note: notes || null,
      created_by: profile.id,
      received_at: receivedAt,
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

  await logAudit({
    action: "CREATE",
    entity: "service_order",
    entity_id: order.id,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: tenantId,
    detail: {
      order_no: orderNo,
      received_date: receivedDate,
      received_at: receivedAt,
      customer_name: customerName,
      customer_phone: customerPhone,
      net_amount: netAmount,
      payment_method: paymentMethod,
      services: serviceIdsRaw.length,
    },
  });

  revalidatePath("/pos");
  revalidatePath("/dashboard");
  return { success: true, orderNo };
}

export async function updateOrderStatus(orderId: string, status: "received" | "in_progress" | "ready" | "delivered" | "cancelled") {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  const supabase = await createClient();

  const { data: before } = await supabase
    .from("service_orders")
    .select("id, order_no, status, customer_name")
    .eq("id", orderId)
    .maybeSingle();

  const updatePayload: {
    status: "received" | "in_progress" | "ready" | "delivered" | "cancelled";
    updated_at: string;
    completed_at?: string;
    delivered_at?: string;
  } = {
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

  await logAudit({
    action: "UPDATE",
    entity: "service_order",
    entity_id: orderId,
    actor_id: profile.id,
    actor_name: profile.display_name,
    tenant_id: profile.tenant_id,
    detail: {
      order_no: before?.order_no,
      from_status: before?.status,
      to_status: status,
      customer_name: before?.customer_name,
    },
  });

  revalidatePath("/pos");
  revalidatePath("/dashboard");
  return { success: true };
}
