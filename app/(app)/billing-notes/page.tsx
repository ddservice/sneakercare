import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { thaiBahtText } from "@/lib/smartacc/baht-text";
import { fetchShopProfile } from "@/app/actions/shop-settings";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft, Layers, Plus } from "lucide-react";
import Link from "next/link";

export default async function BillingNotesPage() {
  await requireProfile();
  const supabase = createAdminClient();

  let documents: any[] = [];
  let shopProfile = {
    name: "บริษัท รวยรับทรัพย์168 จำกัด (SneakerCare)",
    taxId: "0505566000000",
    phone: "089-xxx-xxxx",
    address: "552/4 ถ.เชียงใหม่-ลำพูน ต.หนองหอย อ.เมือง จ.เชียงใหม่ 50000",
    logoUrl: "",
    promptPayId: "0505566000000",
  };

  try {
    const [{ data: docs }, profile] = await Promise.all([
      (supabase as any)
        .schema("extension_layer")
        .from("ext_documents")
        .select("*, ext_contacts(*), ext_document_items(*)")
        .eq("doc_type", "BILLING_NOTE")
        .order("created_at", { ascending: false }),
      fetchShopProfile().catch(() => shopProfile),
    ]);
    if (docs) documents = docs;
    if (profile) shopProfile = profile;
  } catch {
    // Graceful fallback if extension_layer is not configured
    documents = [];
  }

  const currentDoc = documents?.[0];

  if (!currentDoc) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/invoicing"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800 hover:text-teal-900"
          >
            <ArrowLeft className="h-4 w-4" /> กลับหน้าออกเอกสาร
          </Link>
        </div>
        <div className="max-w-xl mx-auto rounded-xl border border-slate-200 bg-white p-12 text-center space-y-4 shadow-xs">
          <div className="mx-auto w-12 h-12 rounded-full bg-teal-50 flex items-center justify-center text-teal-700">
            <Layers className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">ยังไม่มีใบวางบิล (Billing Note) ในระบบ</h3>
            <p className="text-xs text-slate-500">
              คุณสามารถสร้างใบวางบิลใหม่ หรือรวมใบส่งของ (DO) มารวมวางบิลได้ที่หน้า "ออกเอกสาร & วางบิล"
            </p>
          </div>
          <Link href="/invoicing">
            <Button className="bg-teal-700 hover:bg-teal-800 text-white text-xs gap-1.5 h-9">
              <Plus className="h-4 w-4" /> ไปที่หน้าออกเอกสาร & วางบิล
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalTextThai = thaiBahtText(Number(currentDoc.grand_total || 0));

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
        {/* Header with Shop Logo & Details */}
        <div className="flex justify-between items-start border-b border-slate-300 pb-4 mb-4">
          <div className="w-2/3 pr-4 flex items-start gap-3.5">
            {shopProfile.logoUrl && (
              <img
                src={shopProfile.logoUrl}
                alt="Logo"
                className="h-16 w-16 object-contain rounded border border-slate-200 p-1 shrink-0"
              />
            )}
            <div>
              <h1 className="text-base font-bold text-slate-900">
                {shopProfile.name}
              </h1>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {shopProfile.address}
              </p>
              <p className="text-[11px] text-slate-600">
                เลขประจำตัวผู้เสียภาษี: <span className="font-medium text-slate-900">{shopProfile.taxId}</span> {shopProfile.phone ? `| โทร: ${shopProfile.phone}` : ""}
              </p>
            </div>
          </div>
          <div className="w-1/3 text-right">
            <h2 className="text-xl font-black text-teal-900">ใบวางบิล</h2>
            <p className="text-[10px] font-bold text-slate-400 tracking-wider">BILLING NOTE</p>
            <div className="mt-1 text-[11px] space-y-0.5">
              <p><span className="text-slate-500">เลขที่:</span> <strong className="text-slate-900 font-mono">{currentDoc.doc_number}</strong></p>
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
                <td className="p-2 text-right text-slate-600">฿{Number(item.total_line_amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="p-2 text-right font-bold text-teal-900">฿{Number(item.total_line_amount || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Summary Footer */}
        <div className="flex justify-between items-center bg-slate-100 border border-slate-300 rounded p-2.5 mb-4 text-[11px]">
          <div>จำนวนเงินรวม (ตัวอักษร): <span className="font-bold text-slate-900">{totalTextThai}</span></div>
          <div className="text-right">
            <span className="text-slate-600">ยอดรวมค้างชำระสุทธิ: </span>
            <span className="text-sm font-extrabold text-teal-900">฿{Number(currentDoc.grand_total || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
          </div>
        </div>

        {/* Remarks */}
        <div className="border border-dashed border-slate-300 rounded p-2.5 mb-8 text-[10px] text-slate-600">
          <p><strong>การชำระเงิน:</strong> โอนเงินเข้าบัญชี หรือชำระผ่าน PromptPay QR ({shopProfile.promptPayId || shopProfile.taxId})</p>
          <p><strong>หมายเหตุ:</strong> กรุณาส่งสลิปหลักฐานการโอนเงินเพื่อตัดยอดบัญชี</p>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-8 text-[11px]">
          <div className="border border-slate-300 rounded p-3 text-center">
            <p className="font-semibold text-slate-800 mb-8">ในนาม {shopProfile.name}</p>
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
