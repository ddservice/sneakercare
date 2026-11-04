import { z } from 'zod';
const money=z.number().finite().min(0).max(999999999).refine(n=>Math.abs(n*100-Math.round(n*100))<0.00001,'ใช้ทศนิยมไม่เกิน 2 ตำแหน่ง');
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'ใช้วันที่ YYYY-MM-DD').refine(d=>Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d,'วันที่ไม่มีอยู่จริง');
const text=(max:number)=>z.string().trim().max(max);
export const saleCommandSchema=z.object({
 id:z.number().int().positive().optional(),version:z.number().int().positive().optional(),date,
 gross:money,discount:money,net:money,cash:money,transfer:money,paid:money,
 size_s:z.number().int().min(0).max(1000000),size_m:z.number().int().min(0).max(1000000),size_l:z.number().int().min(0).max(1000000),size_xl:z.number().int().min(0).max(1000000),extra_items:text(20000),
}).strict().refine(v=>Math.abs(v.gross-v.discount-v.net)<0.005,'ยอดสุทธิต้องเท่ากับยอดก่อนลดหักส่วนลด').refine(v=>Math.abs(v.cash+v.transfer-v.paid)<0.005&&v.paid<=v.net,'เงินรับต้องตรงกับเงินสดรวมโอนและไม่เกินยอดสุทธิ');
export const posCommandSchema=z.object({
 branch_id:z.string().uuid('เลือกสาขา'),date,customer_name:text(200).min(1,'ระบุชื่อลูกค้า'),customer_phone:text(40).min(1,'ระบุเบอร์ลูกค้า'),
 shoe_brand:text(100),shoe_model:text(150),shoe_color:text(100),shoe_size:text(30),notes:text(2000),
 gross:money,discount:money,net:money,payment_method:z.enum(['cash','transfer','credit','unpaid']),
 services:z.array(z.object({id:z.string().uuid().nullable(),name:text(200).min(1),price:money}).strict()).min(1).max(100),
}).strict().refine(v=>Math.abs(v.gross-v.discount-v.net)<0.005,'ยอดสุทธิต้องเท่ากับราคาหักส่วนลด').refine(v=>Math.abs(v.services.reduce((sum,line)=>sum+line.price,0)-v.gross)<0.005,'ยอดบริการต้องตรงกับยอดก่อนลด');
export const paymentCommandSchema=z.object({sale_id:z.number().int().positive(),received_date:date,amount:money.refine(n=>n>0,'ยอดรับต้องมากกว่า 0'),pay_method:z.enum(['เงินสด','โอน','อื่นๆ']),notes:text(1000)}).strict();
export const documentPayloadSchema=z.object({
 requestId:text(120).min(1,'ไม่พบคีย์รายการ กรุณาโหลดหน้าใหม่'),docType:z.enum(['QUOTATION','DO','INVOICE','BILLING_NOTE','TAX_INVOICE','RECEIPT','CREDIT_NOTE','DEBIT_NOTE']),
 companyName:text(300).min(1,'ระบุชื่อลูกค้า'),taxId:text(30).optional(),branchCode:text(10).optional(),address:text(1000).optional(),phone:text(50).optional(),email:text(200).optional(),
 issueDate:date,dueDate:z.union([date,z.literal('')]).optional(),creditTermDays:z.number().int().min(0).max(3650).optional(),
 items:z.array(z.object({itemName:text(500).min(1,'ระบุชื่อรายการ'),quantity:z.number().finite().positive().max(999999999).refine(n=>Math.abs(n*1000-Math.round(n*1000))<0.00001,'จำนวนไม่เกิน 3 ตำแหน่ง'),unitPrice:money,discount:money,totalLineAmount:money}).strict()).min(1).max(500),
 notes:text(4000).optional(),promptPayTarget:text(30).optional(),billingRefDocIds:z.array(z.string().uuid()).max(100).optional(),refParentDocId:z.string().uuid().optional(),refParentDocNumber:text(50).optional(),chargeVat:z.boolean().optional(),
}).strict();
export function validationMessage(error:z.ZodError){return error.issues.map(i=>`${i.path.join('.')||'ข้อมูล'}: ${i.message}`).join(' · ');}
