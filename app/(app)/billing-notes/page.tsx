import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { thaiBahtText } from "@/lib/smartacc/baht-text";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";

export default async function BillingNotesPage() {
  await requireProfile();
  const supabase = createAdminClient();

  const { data: documents } = await (supabase as any)
    .schema("extension_layer")
    .from("ext_documents")
    .select("*, ext_contacts(*), ext_document_items(*)")
    .eq("doc_type", "BILLING_NOTE")
    .order("created_at", { ascending: false });

  const currentDoc = documents?.[0] || {
    doc_number: "BN-202608-0001",
    issue_date: "2026-08-30",
    due_date: "2026-09-30",
    credit_term_days: 30,
    grand_total: 4030.0,
    ext_contacts: {
      company_name: "บริษัท ตัวอย่างทดสอบ วางบิล จำกัด",
      address: "88/9 หมู่ 5 ถนนสุเทพ ตำบลสุเทพ อำเภอเมือง จังหวัดเชียงใหม่ 50200",
      tax_id: "0505562000000",
    },
    ext_document_items: [
      {
        item_name: "อ้างอิงใบส่งของ DO-202608-0001 (บริการซักรองเท้า 5 คู่)",
        total_line_amount: 3250.0,
      },
      {
        item_name: "อ้างอิงใบส่งของ DO-202608-0002 (น้ำยาทำความสะอาด 2 ขวด)",
        total_line_amount: 780.0,
      },
    ],
  };

  const totalTextThai = thaiBahtText(currentDoc.grand_total);

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between no-print">
        <Link
          href="/invoicing"
          className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-900"
        >
          <ArrowLeft className="h-4 w-4" /> กลับหน้าออกเอกสาร
        </Link>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => {}}
            className="bg-teal-700 hover:bg-teal-800 text-white text-xs gap-1.5"
          >
            <Printer className="h-4 w-4" /> สั่งพิมพ์ / บันทึก PDF (A4)
          </Button>
        </div>
      </div>

      {/* ── A4 Billing Note Render Template ── */}
      <div className="max-w-[210mm] mx-auto bg-white border border-slate-200 shadow-sm p-8 rounded-lg text-slate-800 text-xs font-sans">
        {/* Header */}
        <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
          <div className="w-2/3 pr-4">
            <h1 className="text-base font-bold text-slate-900">
              บริษัท สนีกเกอร์ แคร์ อินเตอร์เนชั่นแนล จำกัด (สำนักงานใหญ่)
            </h1>
            <p className="text-[11px] text-slate-600 mt-0.5">
              123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร 10110
            </p>
            <p className="text-[11px] text-slate-600">
              เลขประจำตัวผู้เสียภาษี: <span className="font-medium text-slate-900">0105558000000</span> | โทร: 02-123-4567
            </p>
          </div>
          <div className="w-1/3 text-right">
            <h2 className="text-xl font-black text-teal-900">ใบวางบิล</h2>
            <p className="text-[10px] font-bold text-slate-400 tracking-wider">BILLING NOTE</p>
            <div className="mt-1 text-[11px] space-y-0.5">
              <p><span className="text-slate-500">เลขที่:</span> <strong className="text-slate-900">{currentDoc.doc_number}</strong></p>
              <p><span className="text-slate-500">วันที่:</span> {currentDoc.issue_date}</p>
              <p><span className="text-slate-500">ครบกำหนด:</span> <strong className="text-rose-600">{currentDoc.due_date}</strong></p>
            </div>
          </div>
        </div>

        {/* Customer Info Box */}
        <div className="bg-slate-50 border border-slate-200 rounded p-3 mb-4 text-[11px]">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-slate-500">ชื่อลูกค้า:</p>
              <p className="font-bold text-slate-900">{currentDoc.ext_contacts?.company_name || "ลูกค้าทั่วไป"}</p>
              <p className="text-slate-600 mt-0.5">{currentDoc.ext_contacts?.address || "-"}</p>
            </div>
            <div className="pl-3 border-l border-slate-200">
              <p><span className="text-slate-500">เลขประจำตัวผู้เสียภาษี:</span> {currentDoc.ext_contacts?.tax_id || "-"}</p>
              <p><span className="text-slate-500">เครดิตเทอม:</span> {currentDoc.credit_term_days || 30} วัน</p>
            </div>
          </div>
        </div>

        {/* Line Items Table */}
        <table className="w-full border-collapse mb-4 text-[11px]">
          <thead>
            <tr className="bg-teal-900 text-white text-left">
              <th className="p-2 text-center w-8">#</th>
              <th className="p-2">รายละเอียดรายการ / เลขที่ใบส่งของ (DO)</th>
              <th className="p-2 text-right w-32">มูลค่ารวม</th>
              <th className="p-2 text-right w-32">ยอดค้างชำระ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 border-b border-slate-300">
            {currentDoc.ext_document_items?.map((item: any, index: number) => (
              <tr key={index}>
                <td className="p-2 text-center text-slate-500">{index + 1}</td>
                <td className="p-2 font-medium text-slate-900">{item.item_name}</td>
                <td className="p-2 text-right text-slate-600">฿{item.total_line_amount?.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="p-2 text-right font-bold text-teal-900">฿{item.total_line_amount?.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary Footer */}
        <div className="flex justify-between items-center bg-slate-100 border border-slate-300 rounded p-2.5 mb-4 text-[11px]">
          <div>จำนวนเงินรวม (ตัวอักษร): <span className="font-bold text-slate-900">{totalTextThai}</span></div>
          <div className="text-right">
            <span className="text-slate-600">ยอดรวมค้างชำระสุทธิ: </span>
            <span className="text-sm font-extrabold text-teal-900">฿{currentDoc.grand_total?.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Remarks */}
        <div className="border border-dashed border-slate-300 rounded p-2.5 mb-8 text-[10px] text-slate-600">
          <p><strong>การชำระเงิน:</strong> โอนเงินเข้าบัญชี หรือชำระผ่าน PromptPay QR</p>
          <p><strong>หมายเหตุ:</strong> กรุณาส่งสลิปหลักฐานการโอนเงินเพื่อตัดยอดบัญชี</p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 text-[11px]">
          <div className="border border-slate-300 rounded p-3 text-center">
            <p className="font-semibold text-slate-800 mb-8">ในนาม บริษัท สนีกเกอร์ แคร์ อินเตอร์เนชั่นแนล จำกัด</p>
            <div className="border-b border-slate-400 w-3/4 mx-auto mb-1.5"></div>
            <p className="text-slate-600">(........................................................)</p>
            <p className="text-slate-500">ผู้วางบิล</p>
            <p className="text-[10px] text-slate-400 mt-0.5">วันที่: ...... / ...... / ......</p>
          </div>
          <div className="border border-slate-300 rounded p-3 text-center bg-slate-50/50">
            <p className="font-semibold text-slate-800 mb-8">ได้รับวางบิลและตรวจสอบเอกสารถูกต้องแล้ว</p>
            <div className="border-b border-slate-400 w-3/4 mx-auto mb-1.5"></div>
            <p className="text-slate-600">(........................................................)</p>
            <p className="text-slate-500">ผู้รับวางบิล / ผู้มีอำนาจลงนาม</p>
            <p className="text-[10px] text-slate-400 mt-0.5">นัดชำระเงินวันที่: ...... / ...... / ......</p>
          </div>
        </div>
      </div>
    </div>
  );
}
