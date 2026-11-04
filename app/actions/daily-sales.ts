"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { requireTenantId, tenantFilter } from "@/lib/tenant";
import { financeRpc } from "@/lib/finance-rpc";
import { saleCommandSchema, paymentCommandSchema, validationMessage } from "@/lib/finance-validation";
import { errorMessage } from "@/lib/errors";

export type DailySaleInput = {
  id?: number;
  version?: number;
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
  sale_id?: number | null;
  sale_date: string;
  received_date: string;
  amount: number;
  pay_method: string;
  notes?: string;
  recorded_by?: string;
  created_at?: string;
};

export type DailySaleWithPayments = {
  service_order_id: string | null;
  id: number;
  version: number;
  legacy_unallocated: number;
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
  const tenantId = await requireTenantId(profile);
  const gross = data.gross_amount ?? ((data.size_s || 0)*200+(data.size_m || 0)*400+(data.size_l || 0)*600+(data.size_xl || 0)*800);
  const discount = data.discount ?? 0;
  const parsed = saleCommandSchema.safeParse({
    ...(data.id ? { id:data.id,version:data.version } : {}),date:data.date,gross,discount,net:data.grand_total ?? gross-discount,
    cash:data.cash_amount,transfer:data.transfer_amount,paid:data.amount_paid ?? data.cash_amount+data.transfer_amount,
    size_s:data.size_s,size_m:data.size_m,size_l:data.size_l,size_xl:data.size_xl,extra_items:data.extra_items || "",
  });
  if (!parsed.success) return { success:false,error:validationMessage(parsed.error) };
  if (data.serviceOrderId) return { success:false,error:"ใบรับงานต้องบันทึกพร้อมยอดขายผ่านหน้ารับงาน" };
  if (data.id && !data.version) return { success:false,error:"กรุณาโหลดรายการใหม่ก่อนแก้ไข" };
  const requestId = data.clientRequestId;
  if (!requestId) return { success:false,error:"ไม่พบคีย์รายการ กรุณาโหลดหน้าใหม่" };
  try {
    const result = await financeRpc("rrs_save_sale",{p_actor:profile.id,p_tenant:tenantId,p_request:requestId,p_data:parsed.data});
    await logAudit({action:data.id?"UPDATE":"CREATE",entity:"daily_sale",entity_id:String(result.id),actor_id:profile.id,actor_name:profile.display_name,tenant_id:tenantId,detail:{...parsed.data,replay:result.replay}});
    revalidatePath("/pos/daily-entry");revalidatePath("/dashboard");
    return {success:true,id:Number(result.id)};
  } catch(err) {return {success:false,error:errorMessage(err,"บันทึกยอดขายไม่สำเร็จ")};}
}

export async function deleteDailySale(id:number,version:number) {
  const profile=await requireProfile();
  requireModuleWrite(profile,"pos");
  const tenantId=await requireTenantId(profile);
  try {
    await financeRpc("rrs_delete_sale",{p_actor:profile.id,p_tenant:tenantId,p_id:id,p_version:version});
    await logAudit({action:"DELETE",entity:"daily_sale",entity_id:id,actor_id:profile.id,actor_name:profile.display_name,tenant_id:tenantId,detail:{version}});
    revalidatePath("/pos/daily-entry");revalidatePath("/dashboard");return {success:true};
  }catch(err){return {success:false,error:errorMessage(err,"ลบรายการไม่สำเร็จ")};}
}

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

export async function fetchRecentDailySales(limit:number=300):Promise<DailySaleWithPayments[]> {
  const profile=await requireProfile();
  requireModuleView(profile,"pos");
  const tenantId=await tenantFilter(profile);
  const result=await financeRpc("rrs_read_sales",{p_actor:profile.id,p_tenant:tenantId,p_limit:Math.max(1,Math.min(1000,limit))});
  const rows=Array.isArray(result.rows)?result.rows:[];
  return rows.map(raw=>{
    const s=raw as Record<string,unknown>;
    const payments=(Array.isArray(s.payments)?s.payments:[]).map(rawPayment=>{
      const p=rawPayment as Record<string,unknown>;
      return {id:Number(p.id),sale_id:p.sale_id==null?null:Number(p.sale_id),sale_date:String(p.sale_date),received_date:String(p.received_date),amount:Number(p.amount),pay_method:String(p.pay_method || ""),notes:String(p.notes || ""),recorded_by:String(p.recorded_by || ""),created_at:String(p.created_at || "")};
    });
    const initialPaid=Number(s.amount_paid ?? Number(s.cash_amount || 0)+Number(s.transfer_amount || 0));
    const revenue=Number(s.total_revenue ?? Number(s.grand_total || 0)-Number(s.discount || 0));
    const arPaid=payments.reduce((sum,p)=>sum+p.amount,0);const totalPaid=initialPaid+arPaid;const outstanding=Math.max(0,revenue-totalPaid);
    return {id:Number(s.id),service_order_id:s.service_order_id == null ? null : String(s.service_order_id),version:Number(s.version),legacy_unallocated:Number(s.legacy_unallocated || 0),date:String(s.date),size_s:Number(s.size_s || 0),size_m:Number(s.size_m || 0),size_l:Number(s.size_l || 0),size_xl:Number(s.size_xl || 0),
      cash_amount:Number(s.cash_amount || 0),transfer_amount:Number(s.transfer_amount || 0),amount_paid:initialPaid,discount:Number(s.discount || 0),grand_total:Number(s.grand_total || 0),total_revenue:revenue,
      payment_status:outstanding>0?"ค้างชำระ":"ชำระครบ",extra_items:String(s.extra_items || ""),recorded_by:String(s.recorded_by || "Staff"),created_at:String(s.created_at || ""),payments,total_ar_paid:arPaid,total_paid:totalPaid,outstanding};
  });
}

/**
 * Record an Accounts Receivable (AR) Payment for an outstanding sale date
 */
export async function recordArPayment(data:{sale_id:number;sale_date?:string;received_date:string;amount:number;pay_method:string;notes?:string;clientRequestId?:string}) {
  const profile=await requireProfile();
  requireModuleWrite(profile,"pos");
  const tenantId=await requireTenantId(profile);
  const parsed=paymentCommandSchema.safeParse({sale_id:data.sale_id,received_date:data.received_date,amount:data.amount,pay_method:data.pay_method,notes:data.notes || ""});
  if(!parsed.success)return {success:false,error:validationMessage(parsed.error)};
  if(!data.clientRequestId)return {success:false,error:"ไม่พบคีย์รายการ กรุณาเปิดหน้ารับเงินใหม่"};
  try{
    const result=await financeRpc("rrs_record_payment",{p_actor:profile.id,p_tenant:tenantId,p_request:data.clientRequestId,p_data:parsed.data});
    await logAudit({action:"CREATE",entity:"ar_payment",entity_id:String(result.id),actor_id:profile.id,actor_name:profile.display_name,tenant_id:tenantId,detail:parsed.data});
    revalidatePath("/pos/daily-entry");revalidatePath("/dashboard");return {success:true,id:Number(result.id)};
  }catch(err){return {success:false,error:errorMessage(err,"บันทึกรับชำระไม่สำเร็จ")};}
}

export async function deleteArPayment(paymentId:number,_saleDate?:string){
  const profile=await requireProfile();
  requireModuleWrite(profile,"pos");
  const tenantId=await requireTenantId(profile);
  try{
    await financeRpc("rrs_delete_payment",{p_actor:profile.id,p_tenant:tenantId,p_id:paymentId});
    await logAudit({action:"DELETE",entity:"ar_payment",entity_id:paymentId,actor_id:profile.id,actor_name:profile.display_name,tenant_id:tenantId,detail:{}});
    revalidatePath("/pos/daily-entry");revalidatePath("/dashboard");return {success:true};
  }catch(err){return {success:false,error:errorMessage(err,"ลบรับชำระไม่สำเร็จ")};}
}
