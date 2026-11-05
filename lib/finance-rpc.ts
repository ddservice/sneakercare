import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
export type FinanceCommand='rrs_save_sale'|'rrs_record_payment'|'rrs_delete_payment'|'rrs_create_service_order'|'rrs_create_document'|'rrs_issue_document'|'rrs_document_lifecycle'|'rrs_read_sales'|'rrs_delete_sale'|'rrs_set_order_status'|'rrs_accountant_packet'|'rrs_create_expense'|'rrs_delete_expense'|'rrs_record_rental_wht';
/** New migration RPCs are isolated here until production types are regenerated. */
export async function financeRpc(name:FinanceCommand,args:Record<string,unknown>):Promise<Record<string,unknown>>{
 const db=createAdminClient();
 const rpc=db.rpc.bind(db) as unknown as (fn:string,p:Record<string,unknown>)=>Promise<{data:unknown;error:{code?:string;message:string}|null}>;
 const {data,error}=await rpc(name,args);
 if(error){
  if(['PGRST202','42883'].includes(error.code||''))throw Error('ระบบรายการเงินกำลังปรับรุ่น กรุณาให้ผู้ดูแลติดตั้งฐานข้อมูลก่อน');
  if(['40001','23514','22023','P0001','42501'].includes(error.code||''))throw Error(error.message);
  console.error(`[finance:${name}]`,error.code);
  throw Error('บันทึกรายการไม่สำเร็จ กรุณาลองซ้ำด้วยรายการเดิม');
 }
 if(typeof data!=='object'||data===null||Array.isArray(data))throw Error('ระบบไม่คืนผลรายการที่ถูกต้อง');
 return data as Record<string,unknown>;
}
