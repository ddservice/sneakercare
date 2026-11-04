"use server";

import { revalidatePath } from "next/cache";
import { financeRpc } from "@/lib/finance-rpc";
import { posCommandSchema, validationMessage } from "@/lib/finance-validation";
import { resolveBranchVat } from "@/lib/branch-vat";
import { requireProfile, requireModuleWrite } from "@/lib/auth";
import { getSelectedBranchId } from "@/lib/branch";
import { logAudit } from "@/lib/audit";
import { requireTenantId } from "@/lib/tenant";
import { errorMessage } from "@/lib/errors";
import { mayLiveAutoIssue, planLiveStockIssue } from "@/lib/service-usage";
import { readServiceUsageConfig } from "@/lib/service-usage-store";

export type PosActionState = {
  error?: string;
  success?: boolean;
  orderNo?: string;
  orderId?: string;
  postedToBooks?: boolean;
} | undefined;

export async function createServiceOrder(_prev: PosActionState, formData: FormData): Promise<PosActionState> {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  try {
    const tenantId = await requireTenantId(profile);
    const branchId = await getSelectedBranchId(profile) || (await resolveBranchVat(profile)).branchId;
    const field = (key: string) => String(formData.get(key) ?? "").trim();
    const requestId = field("request_id");
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) return { error: "ไม่พบคีย์รายการ กรุณาโหลดหน้าใหม่" };
    const services = formData.getAll("service_items").map(raw => {
      const item = JSON.parse(String(raw)) as { id?: string; name?: string; price?: number };
      return { id: item.id && /^[0-9a-f-]{36}$/i.test(item.id) ? item.id : null, name: String(item.name ?? ""), price: Number(item.price) };
    });
    const parsed = posCommandSchema.safeParse({
      branch_id: branchId, date: field("received_date"), customer_name: field("customer_name"), customer_phone: field("customer_phone"),
      shoe_brand: field("shoe_brand"), shoe_model: field("shoe_model"), shoe_color: field("shoe_color"), shoe_size: field("shoe_size"), notes: field("notes"),
      gross: Number(field("gross_amount")), discount: Number(field("discount_amount")), net: Number(field("net_amount")), payment_method: field("payment_method"), services,
    });
    if (!parsed.success) return { error: validationMessage(parsed.error) };
    // Automatic issue remains blocked until its existing feature gate is approved.
    const usage = await readServiceUsageConfig(tenantId);
    const liveIssue = planLiveStockIssue({ flags: usage.flags, requestedPoint: "receive" });
    if (mayLiveAutoIssue(usage.flags) || liveIssue.ok) console.warn("[pos] live auto-issue is blocked at server");
    const result = await financeRpc("rrs_create_service_order", { p_actor: profile.id, p_tenant: tenantId, p_request: requestId, p_data: parsed.data });
    await logAudit({ action: "CREATE", entity: "service_order", entity_id: String(result.id), actor_id: profile.id, actor_name: profile.display_name, tenant_id: tenantId, detail: { order_no: result.order_no, posted_to_books: result.posted_to_books, replay: result.replay } });
    revalidatePath("/pos"); revalidatePath("/dashboard");
    return { success: true, orderNo: String(result.order_no), orderId: String(result.id), postedToBooks: result.posted_to_books === true };
  } catch (err) { return { error: errorMessage(err, "รับงานไม่สำเร็จ กรุณาลองซ้ำด้วยรายการเดิม") }; }
}

export async function updateOrderStatus(orderId: string, status: "received" | "in_progress" | "ready" | "delivered" | "cancelled") {
  const profile = await requireProfile();
  requireModuleWrite(profile, "pos");
  const tenantId = await requireTenantId(profile);
  const result = await financeRpc("rrs_set_order_status", { p_actor: profile.id,p_tenant: tenantId,p_id: orderId,p_status: status });
  await logAudit({ action:"UPDATE",entity:"service_order",entity_id:orderId,actor_id:profile.id,actor_name:profile.display_name,tenant_id:tenantId,detail:{to_status:status,accounting_review:result.accounting_review} });
  revalidatePath("/pos");revalidatePath("/dashboard");
  return { success:true,accountingReview:result.accounting_review === true };
}
