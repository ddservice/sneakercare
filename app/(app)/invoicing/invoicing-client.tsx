"use client";

import { useState, useTransition } from "react";
import {
  createSmartAccDocument,
  lookupDbdCompany,
  type CreateDocumentPayload,
  type DocumentItemInput,
} from "@/app/actions/smartacc-documents";
import { DOC_TYPE_CONFIG, type DocumentType } from "@/lib/smartacc/types";
import { thaiBahtText } from "@/lib/smartacc/baht-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileText,
  Building2,
  Search,
  Plus,
  Trash2,
  QrCode,
  Printer,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
} from "lucide-react";

export type PendingDeliveryOrder = {
  id: string;
  doc_number: string;
  doc_type: string;
  issue_date: string;
  grand_total: number;
  status: string;
  ext_contacts?: { company_name?: string } | null;
};

export function InvoicingClient({
  pendingDOs,
}: {
  pendingDOs: PendingDeliveryOrder[];
}) {
  const [docType, setDocType] = useState<DocumentType>("INVOICE");
  const [isPending, startTransition] = useTransition();

  // Contact / Juristic State
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branchCode, setBranchCode] = useState("00000");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isSearchingDbd, setIsSearchingDbd] = useState(false);

  // Document meta
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [creditTermDays, setCreditTermDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [promptPayTarget, setPromptPayTarget] = useState("0105558000000");

  // Line items
  const [items, setItems] = useState<DocumentItemInput[]>([
    {
      itemName: "บริการซักทำความสะอาดรองเท้าพรีเมียม (Sneaker Deep Clean)",
      quantity: 5,
      unitPrice: 650,
      discount: 0,
      totalLineAmount: 3250,
    },
    {
      itemName: "น้ำยาทำความสะอาดรองเท้าสูตรพิเศษ (Sneaker Cleaner 500ml)",
      quantity: 2,
      unitPrice: 390,
      discount: 0,
      totalLineAmount: 780,
    },
  ]);

  // Selected DOs for Billing Note
  const [selectedDoIds, setSelectedDoIds] = useState<string[]>([]);

  // Generated document state
  const [createdDoc, setCreatedDoc] = useState<{
    docNumber: string;
    shareToken?: string;
  } | null>(null);

  // Calculations
  const subtotal = items.reduce((sum, it) => sum + it.totalLineAmount, 0);
  const vatRate = docType === "QUOTATION" || docType === "DO" ? 0 : 7.0;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  async function handleDbdSearch() {
    if (!taxId && !companyName) {
      toast.error("กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก หรือชื่อบริษัท");
      return;
    }
    setIsSearchingDbd(true);
    try {
      const result = await lookupDbdCompany(taxId || companyName);
      if (result) {
        setCompanyName(result.companyName);
        setTaxId(result.taxId);
        setBranchCode(result.branchCode);
        setAddress(result.address);
        toast.success("ดึงข้อมูลนิติบุคคลสำเร็จ");
      } else {
        toast.error("ไม่พบข้อมูลนิติบุคคลในฐานข้อมูล DBD");
      }
    } finally {
      setIsSearchingDbd(false);
    }
  }

  function handleAddItem() {
    setItems([
      ...items,
      {
        itemName: "",
        quantity: 1,
        unitPrice: 0,
        discount: 0,
        totalLineAmount: 0,
      },
    ]);
  }

  function handleUpdateItem(index: number, field: keyof DocumentItemInput, value: any) {
    const updated = [...items];
    const item = { ...updated[index], [field]: value };

    if (field === "quantity" || field === "unitPrice" || field === "discount") {
      const q = field === "quantity" ? Number(value) : item.quantity;
      const p = field === "unitPrice" ? Number(value) : item.unitPrice;
      const d = field === "discount" ? Number(value) : item.discount;
      item.totalLineAmount = Math.max(0, q * p - d);
    }

    updated[index] = item;
    setItems(updated);
  }

  function handleRemoveItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function handleToggleDo(doItem: PendingDeliveryOrder) {
    if (selectedDoIds.includes(doItem.id)) {
      setSelectedDoIds(selectedDoIds.filter((id) => id !== doItem.id));
      setItems(items.filter((it) => it.itemName !== `อ้างอิงใบส่งของ: ${doItem.doc_number}`));
    } else {
      setSelectedDoIds([...selectedDoIds, doItem.id]);
      setItems([
        ...items,
        {
          itemName: `อ้างอิงใบส่งของ: ${doItem.doc_number}`,
          quantity: 1,
          unitPrice: doItem.grand_total,
          discount: 0,
          totalLineAmount: doItem.grand_total,
        },
      ]);
    }
  }

  async function handleCreateDocument() {
    if (!companyName) {
      toast.error("กรุณากรอกชื่อลูกค้าหรือชื่อบริษัท");
      return;
    }
    if (items.length === 0 || subtotal <= 0) {
      toast.error("กรุณาระบุรายการสินค้า/บริการอย่างน้อย 1 รายการ");
      return;
    }

    const payload: CreateDocumentPayload = {
      docType,
      companyName,
      taxId,
      branchCode,
      address,
      phone,
      email,
      issueDate,
      dueDate,
      creditTermDays,
      items,
      notes,
      promptPayTarget,
      billingRefDocIds: selectedDoIds,
    };

    startTransition(async () => {
      try {
        const res = await createSmartAccDocument(payload);
        if (res.success) {
          toast.success(`สร้างเอกสาร ${res.docNumber} สำเร็จ`);
          setCreatedDoc({ docNumber: res.docNumber, shareToken: res.shareToken });
        }
      } catch (err: any) {
        toast.error(err.message || "เกิดข้อผิดพลาดในการสร้างเอกสาร");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
            <FileText className="h-3.5 w-3.5" />
            Fast Invoicing & Smart Billing
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            ออกเอกสาร & ใบวางบิลอัจฉริยะ
          </h2>
          <p className="text-xs text-slate-500">
            สร้างใบเสนอราคา ใบส่งของ ใบแจ้งหนี้ ใบวางบิล และใบกำกับภาษี พร้อม PromptPay QR และ e-Tax
          </p>
        </div>

        {/* Document Type Pills */}
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
          {(Object.keys(DOC_TYPE_CONFIG) as DocumentType[]).map((type) => (
            <button
              key={type}
              onClick={() => setDocType(type)}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-all ${
                docType === type
                  ? "bg-teal-700 text-white shadow-xs"
                  : "text-slate-600 hover:bg-slate-200"
              }`}
            >
              {DOC_TYPE_CONFIG[type].prefix} : {DOC_TYPE_CONFIG[type].labelTh}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Form Grid ── */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* ── Left Column: Form Builder (7 cols) ── */}
        <div className="lg:col-span-7 space-y-6">
          {/* Customer / Juristic Card */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-teal-700" />
                ข้อมูลลูกค้า & นิติบุคคล
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* DBD Search Bar */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">
                  ค้นหาข้อมูลนิติบุคคลจาก DBD (เลข 13 หลัก หรือ ชื่อบริษัท)
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <Input
                      value={taxId}
                      onChange={(e) => setTaxId(e.target.value)}
                      placeholder="เช่น 0105558000000 หรือ ชื่อบริษัท"
                      className="pl-9 text-xs h-9"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleDbdSearch}
                    disabled={isSearchingDbd}
                    className="bg-teal-700 text-white text-xs h-9 hover:bg-teal-800"
                  >
                    {isSearchingDbd ? "กำลังค้นหา..." : "ค้นหา DBD"}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700">
                    ชื่อลูกค้า / บริษัท <span className="text-rose-500">*</span>
                  </Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="บริษัท สนีกเกอร์ แคร์ จำกัด หรือชื่อลูกค้า"
                    className="text-xs h-9"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    เลขประจำตัวผู้เสียภาษี (Tax ID)
                  </Label>
                  <Input
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    placeholder="เลข 13 หลัก"
                    className="text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    รหัสสาขา (Branch Code)
                  </Label>
                  <Input
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    placeholder="00000 (สำนักงานใหญ่)"
                    className="text-xs h-9"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-semibold text-slate-700">ที่อยู่ออกใบกำกับภาษี</Label>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="เลขที่ อาคาร ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                    className="text-xs h-9"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DO Picker Section for Billing Notes */}
          {docType === "BILLING_NOTE" && (
            <Card className="border-teal-200 bg-teal-50/40 shadow-xs">
              <CardHeader className="border-b border-teal-100 pb-3">
                <CardTitle className="text-sm font-bold text-teal-900 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-teal-700" />
                  DO-Picker: เลือกใบส่งของ / ใบแจ้งหนี้ที่ค้างชำระมารวมวางบิล
                </CardTitle>
                <CardDescription className="text-xs">
                  เลือกใบส่งของที่ส่งมอบแล้วเพื่อรวมยอดวางบิลในใบเดียว
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {pendingDOs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-3">
                    ไม่พบใบส่งของหรือใบแจ้งหนี้ที่ค้างชำระในระบบ
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {pendingDOs.map((doItem) => (
                      <div
                        key={doItem.id}
                        onClick={() => handleToggleDo(doItem)}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                          selectedDoIds.includes(doItem.id)
                            ? "border-teal-600 bg-teal-100/80 font-semibold"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedDoIds.includes(doItem.id)}
                            onChange={() => {}}
                            className="rounded text-teal-700"
                          />
                          <div>
                            <span className="font-bold text-teal-800">{doItem.doc_number}</span>
                            <span className="text-slate-500 ml-2">({doItem.issue_date})</span>
                          </div>
                        </div>
                        <div className="font-mono font-bold text-slate-900">
                          ฿{doItem.grand_total.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Line Items Table */}
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold">รายการสินค้า / บริการ</CardTitle>
                <CardDescription className="text-xs">
                  ระบุรายละเอียด จำนวน และราคาต่อหน่วย
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddItem}
                className="text-xs gap-1 h-8"
              >
                <Plus className="h-3.5 w-3.5" /> เพิ่มแถว
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-100 bg-slate-50 text-slate-600 uppercase font-semibold">
                    <tr>
                      <th className="px-3 py-2.5">รายการ</th>
                      <th className="px-3 py-2.5 text-center w-20">จำนวน</th>
                      <th className="px-3 py-2.5 text-right w-28">ราคา/หน่วย</th>
                      <th className="px-3 py-2.5 text-right w-28">ยอดรวม</th>
                      <th className="px-2 py-2.5 text-center w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2">
                          <Input
                            value={item.itemName}
                            onChange={(e) => handleUpdateItem(idx, "itemName", e.target.value)}
                            placeholder="ชื่อสินค้าหรือบริการ"
                            className="text-xs h-8"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(idx, "quantity", e.target.value)}
                            className="text-xs h-8 text-center"
                          />
                        </td>
                        <td className="p-2">
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => handleUpdateItem(idx, "unitPrice", e.target.value)}
                            className="text-xs h-8 text-right font-mono"
                          />
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-800">
                          {item.totalLineAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-slate-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Right Column: Document Summary Slip & Action (5 cols) ── */}
        <div className="lg:col-span-5 space-y-6">
          <Card className="border-slate-200 bg-slate-50/50 shadow-xs">
            <CardHeader className="border-b border-slate-200 pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>สรุปเอกสาร (Preview)</span>
                <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200">
                  {DOC_TYPE_CONFIG[docType].labelTh}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              {/* Document Meta Inputs */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600">วันที่เอกสาร</Label>
                  <Input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] font-semibold text-slate-600">ครบกำหนดชำระ</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="text-xs h-8"
                  />
                </div>
              </div>

              {/* Monetary Aggregation */}
              <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>มูลค่ารวม (Subtotal):</span>
                  <span className="font-mono font-bold">{subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
                </div>
                {vatRate > 0 && (
                  <div className="flex justify-between text-slate-600">
                    <span>ภาษีมูลค่าเพิ่ม (VAT 7%):</span>
                    <span className="font-mono font-bold text-teal-700">+{vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold text-slate-900 border-t border-slate-200 pt-2">
                  <span>ยอดสุทธิ (Grand Total):</span>
                  <span className="font-mono text-teal-800 text-base">฿{grandTotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="text-[11px] text-slate-500 text-right italic">
                  ({thaiBahtText(grandTotal)})
                </div>
              </div>

              {/* Dynamic PromptPay QR Box */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center space-y-2">
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-800">
                  <QrCode className="h-4 w-4 text-teal-700" />
                  <span>Dynamic PromptPay QR (EMVCo)</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  ระบบจะสร้าง QR Code พร้อมยอดเงิน <strong className="text-teal-800">฿{grandTotal.toLocaleString()}</strong> ฝังในบิลโดยอัตโนมัติ
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <Label className="text-[11px] text-slate-500">เบอร์/Tax ID PromptPay:</Label>
                  <Input
                    value={promptPayTarget}
                    onChange={(e) => setPromptPayTarget(e.target.value)}
                    className="h-7 w-36 text-xs text-center font-mono"
                  />
                </div>
              </div>

              {/* Action Button */}
              <Button
                type="button"
                disabled={isPending}
                onClick={handleCreateDocument}
                className="w-full h-11 bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm shadow-xs"
              >
                {isPending ? "กำลังบันทึกเอกสาร..." : `ออกเอกสาร ${DOC_TYPE_CONFIG[docType].labelTh}`}
              </Button>

              {createdDoc && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span>ออกเอกสารเลขที่ {createdDoc.docNumber} เรียบร้อยแล้ว!</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => window.print()}
                      variant="outline"
                      className="text-xs h-7 gap-1 border-emerald-300"
                    >
                      <Printer className="h-3.5 w-3.5" /> พิมพ์เอกสาร (PDF)
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
