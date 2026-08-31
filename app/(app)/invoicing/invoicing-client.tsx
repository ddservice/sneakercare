"use client";

import { useState, useMemo, useTransition } from "react";
import {
  createSmartAccDocument,
  convertDocument,
  lookupDbdCompany,
  type CreateDocumentPayload,
  type DocumentItemInput,
  type CatalogItem,
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
  Layers,
  ArrowRight,
  Sparkles,
  History,
  Repeat,
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

import type { ShopProfile } from "@/app/actions/shop-settings";

export function InvoicingClient({
  pendingDOs,
  catalog,
  existingDocs,
  shopProfile,
}: {
  pendingDOs: PendingDeliveryOrder[];
  catalog: CatalogItem[];
  existingDocs: any[];
  shopProfile?: ShopProfile;
}) {
  const [docType, setDocType] = useState<DocumentType>("INVOICE");
  const [isPending, startTransition] = useTransition();

  // Contact / Customer State
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branchCode, setBranchCode] = useState("00000");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Document meta
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [creditTermDays, setCreditTermDays] = useState(30);
  const [notes, setNotes] = useState("");
  const [promptPayTarget, setPromptPayTarget] = useState(
    shopProfile?.promptPayId || shopProfile?.taxId || ""
  );

  // Line items - Start clean, no dummy items
  const [items, setItems] = useState<DocumentItemInput[]>([]);

  // Selected DOs for Billing Note
  const [selectedDoIds, setSelectedDoIds] = useState<string[]>([]);

  // Catalog UI State
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogCategoryTab, setCatalogCategoryTab] = useState<string>("all");

  const filteredCatalog = useMemo(() => {
    return catalog.filter((cat) => {
      const matchCat =
        catalogCategoryTab === "all" ||
        (catalogCategoryTab === "package" && cat.category === "package") ||
        (catalogCategoryTab === "treatment" &&
          ["treatment", "cleaning", "repair", "protection"].includes(cat.category)) ||
        (catalogCategoryTab === "product" && cat.category === "product");

      const matchSearch =
        !catalogSearch.trim() ||
        cat.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
        String(cat.price).includes(catalogSearch);

      return matchCat && matchSearch;
    });
  }, [catalog, catalogCategoryTab, catalogSearch]);

  // Generated document state
  const [createdDoc, setCreatedDoc] = useState<{
    docNumber: string;
    shareToken?: string;
  } | null>(null);

  // Active view tab
  const [activeView, setActiveView] = useState<"create" | "history">("create");

  // Calculations
  const subtotal = items.reduce((sum, it) => sum + it.totalLineAmount, 0);
  const isTaxApplicable = ["INVOICE", "BILLING_NOTE", "TAX_INVOICE", "RECEIPT"].includes(docType);
  const vatRate = isTaxApplicable ? 7.0 : 0.0;
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;

  // DBD search state
  const [isSearchingDbd, setIsSearchingDbd] = useState(false);
  const [dbdSearchInput, setDbdSearchInput] = useState("");

  async function handleDbdSearch(query?: string) {
    const q = query || dbdSearchInput || taxId || companyName;
    if (!q) {
      toast.error("กรุณากรอกเลขประจำตัวผู้เสียภาษี 13 หลัก หรือพิมพ์ชื่อบริษัท");
      return;
    }

    setIsSearchingDbd(true);
    try {
      const res = await lookupDbdCompany(q);
      if (res) {
        setCompanyName(res.companyName);
        setTaxId(res.taxId);
        setBranchCode(res.branchCode || "00000");
        setAddress(res.address || "สำนักงานใหญ่");
        if (res.phone) setPhone(res.phone);
        if (res.email) setEmail(res.email);
        setDbdSearchInput(res.taxId || res.companyName);
        toast.success(`ดึงข้อมูล DBD สำเร็จ: ${res.companyName}`);
      } else {
        toast.error("ไม่พบข้อมูลนิติบุคคลจากคำค้นหานี้ในระบบ DBD");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการดึงข้อมูล DBD");
    } finally {
      setIsSearchingDbd(false);
    }
  }

  function handleAddCatalogItem(catItem: CatalogItem) {
    setItems([
      ...items,
      {
        itemName: catItem.name,
        quantity: 1,
        unitPrice: catItem.price,
        discount: 0,
        totalLineAmount: catItem.price,
      },
    ]);
    toast.success(`เพิ่ม "${catItem.name}" เรียบร้อย`);
  }

  function handleAddBlankItem() {
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
          setItems([]);
          setCompanyName("");
          setTaxId("");
          setBranchCode("00000");
          setAddress("");
          setDbdSearchInput("");
        }
      } catch (err: any) {
        toast.error(err.message || "เกิดข้อผิดพลาดในการสร้างเอกสาร");
      }
    });
  }

  async function handleConvert(docId: string, targetType: DocumentType) {
    startTransition(async () => {
      try {
        const res = await convertDocument(docId, targetType);
        if (res.success) {
          toast.success(`แปลงเอกสารเป็น ${res.docNumber} (${DOC_TYPE_CONFIG[targetType].labelTh}) เรียบร้อย`);
        }
      } catch (err: any) {
        toast.error(err.message || "เกิดข้อผิดพลาดในการแปลงเอกสาร");
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
            Standard Document & Invoicing Pipeline
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            ระบบออกเอกสาร & การเชื่อมโยงเอกสาร (Flow)
          </h2>
          <p className="text-xs text-slate-500">
            ใบเสนอราคา (QA) ➔ ใบส่งของ (DO) ➔ ใบแจ้งหนี้ (INV) ➔ ใบวางบิล (BL) ➔ ใบเสร็จ/ใบกำกับภาษี (REC/TAX)
          </p>
        </div>

        {/* View Switcher */}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={activeView === "create" ? "default" : "outline"}
            onClick={() => setActiveView("create")}
            className={`text-xs gap-1.5 h-9 ${activeView === "create" ? "bg-teal-700 hover:bg-teal-800 text-white" : ""}`}
          >
            <Plus className="h-3.5 w-3.5" /> ออกเอกสารใหม่
          </Button>
          <Button
            size="sm"
            variant={activeView === "history" ? "default" : "outline"}
            onClick={() => setActiveView("history")}
            className={`text-xs gap-1.5 h-9 ${activeView === "history" ? "bg-teal-700 hover:bg-teal-800 text-white" : ""}`}
          >
            <History className="h-3.5 w-3.5" /> ประวัติเอกสารทั้งหมด ({existingDocs.length})
          </Button>
        </div>
      </div>

      {activeView === "create" ? (
        <>
          {/* Document Type Selector */}
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            {(Object.keys(DOC_TYPE_CONFIG) as DocumentType[]).map((type) => (
              <button
                key={type}
                onClick={() => setDocType(type)}
                className={`rounded-lg px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 ${
                  docType === type
                    ? "bg-teal-700 text-white shadow-xs"
                    : "text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200"
                }`}
              >
                <span className="font-mono">{DOC_TYPE_CONFIG[type].prefix}</span>
                <span>:</span>
                <span>{DOC_TYPE_CONFIG[type].labelTh}</span>
              </button>
            ))}
          </div>

          {/* ── Main Form Grid ── */}
          <div className="grid gap-8 lg:grid-cols-12">
            {/* ── Left Column: Form Builder (7 cols) ── */}
            <div className="lg:col-span-7 space-y-6">
              {/* Customer Info Card */}
              <Card className="border-slate-200 shadow-xs">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-teal-700" />
                        ข้อมูลลูกค้า / ผู้รับเอกสาร (Bill To / Customer)
                      </CardTitle>
                      <CardDescription className="text-xs mt-0.5">
                        ระบุชื่อลูกค้าหรือบริษัทที่เราต้องการออกบิลไปเรียกเก็บเงิน
                      </CardDescription>
                    </div>
                    {shopProfile && (
                      <div className="hidden sm:flex items-center gap-2 rounded-lg bg-teal-50 border border-teal-100 px-2.5 py-1 text-[11px] text-teal-800">
                        {shopProfile.logoUrl && (
                          <img src={shopProfile.logoUrl} alt="Logo" className="h-4 w-4 object-contain rounded" />
                        )}
                        <span>ผู้ออกบิล: <strong>{shopProfile.name}</strong></span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  {/* DBD Auto-Fill Bar */}
                  <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3 space-y-2">
                    <Label className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                      <Search className="h-3.5 w-3.5 text-teal-700" />
                      ค้นหา & ดึงข้อมูลอัตโนมัติจาก DBD / ทะเบียนพาณิชย์ (13 หลัก หรือ ชื่อบริษัท)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={dbdSearchInput}
                        onChange={(e) => setDbdSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleDbdSearch();
                          }
                        }}
                        placeholder="พิมพ์เลขผู้เสียภาษี 13 หลัก เช่น 0105558000000 หรือชื่อบริษัท..."
                        className="text-xs h-9 bg-white font-mono"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSearchingDbd}
                        onClick={() => handleDbdSearch()}
                        className="bg-teal-700 hover:bg-teal-800 text-white text-xs h-9 px-4 shrink-0 font-semibold gap-1"
                      >
                        {isSearchingDbd ? "กำลังค้นหา..." : "ดึงข้อมูล DBD"}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-semibold text-slate-700">
                        ชื่อลูกค้า หรือ บริษัทผู้รับเอกสาร <span className="text-rose-500">*</span>
                      </Label>
                      <Input
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="เช่น บริษัท เอสเทีย เชียงใหม่ จำกัด หรือ บริษัท รวยรับทรัพย์168 จำกัด"
                        className="text-xs h-9"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-slate-700">
                          เลขประจำตัวผู้เสียภาษีลูกค้า (Tax ID)
                        </Label>
                        {taxId.length >= 10 && (
                          <button
                            type="button"
                            onClick={() => handleDbdSearch(taxId)}
                            className="text-[11px] text-teal-700 hover:underline font-semibold"
                          >
                            ดึงข้อมูล DBD จากเลขนี้
                          </button>
                        )}
                      </div>
                      <Input
                        value={taxId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTaxId(val);
                          if (val.replace(/[^0-9]/g, "").length === 13) {
                            handleDbdSearch(val);
                          }
                        }}
                        placeholder="เลข 13 หลักของลูกค้า (พิมพ์ครบ 13 หลักระบบจะดึง DBD ทันที)"
                        className="text-xs h-9 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-slate-700">
                        รหัสสาขา (Branch Code)
                      </Label>
                      <Input
                        value={branchCode || "00000"}
                        onChange={(e) => setBranchCode(e.target.value || "00000")}
                        placeholder="00000 (สำนักงานใหญ่)"
                        className="text-xs h-9 font-mono"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label className="text-xs font-semibold text-slate-700">ที่อยู่จดทะเบียน / ที่อยู่ออกเอกสาร</Label>
                      <Input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="ที่อยู่สำหรับออกเอกสาร"
                        className="text-xs h-9"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Structured & Categorized Professional Catalog Quick Add Panel */}
              <Card className="border-teal-200 bg-white shadow-xs overflow-hidden">
                <CardHeader className="p-3.5 bg-gradient-to-r from-teal-50/80 via-slate-50 to-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                      <Sparkles className="h-4 w-4 text-teal-700" />
                      เลือกรายการบริการ / สินค้าจากระบบ (Catalog)
                    </CardTitle>
                    <CardDescription className="text-[11px] text-slate-500">
                      คลิกเพื่อเพิ่มรายการเข้าสู่เอกสารทันที พร้อมคำนวณภาษีและยอดสุทธิอัตโนมัติ
                    </CardDescription>
                  </div>

                  {/* Search input */}
                  <div className="relative w-48">
                    <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      type="text"
                      placeholder="ค้นหาบริการ/สินค้า..."
                      value={catalogSearch}
                      onChange={(e) => setCatalogSearch(e.target.value)}
                      className="h-7.5 pl-8 pr-2 text-xs bg-white rounded-lg border-slate-200"
                    />
                  </div>
                </CardHeader>

                <CardContent className="p-3.5 space-y-3">
                  {/* Category Filter Tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 pb-2.5">
                    {[
                      { id: "all", label: "🌐 ทั้งหมด", count: catalog.length },
                      { id: "package", label: "👟 แพ็กเกจหลัก (Packages)", count: catalog.filter((c) => c.category === "package").length },
                      { id: "treatment", label: "🛡️ บริการเสริม & ซ่อม (Treatments)", count: catalog.filter((c) => ["treatment", "cleaning", "repair", "protection"].includes(c.category)).length },
                      { id: "product", label: "🧴 น้ำยา & อุปกรณ์ (Supplies)", count: catalog.filter((c) => c.category === "product").length },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCatalogCategoryTab(tab.id)}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-all cursor-pointer ${
                          catalogCategoryTab === tab.id
                            ? "bg-teal-800 text-white shadow-2xs"
                            : "bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        {tab.label} <span className="opacity-70 text-[10px]">({tab.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Filtered Grid Cards */}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-56 overflow-y-auto pr-1">
                    {filteredCatalog.map((cat) => {
                      const isPkg = cat.category === "package";
                      const isTreatment = ["treatment", "cleaning", "repair", "protection"].includes(cat.category);

                      return (
                        <div
                          key={cat.id}
                          onClick={() => handleAddCatalogItem(cat)}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer group text-xs ${
                            isPkg
                              ? "bg-teal-50/40 border-teal-200 hover:bg-teal-100/70 hover:border-teal-400"
                              : isTreatment
                              ? "bg-amber-50/40 border-amber-200 hover:bg-amber-100/70 hover:border-amber-400"
                              : "bg-slate-50 border-slate-200 hover:bg-slate-100 hover:border-slate-300"
                          }`}
                        >
                          <div className="space-y-0.5 min-w-0 pr-2">
                            <div className="font-bold text-slate-900 truncate group-hover:text-teal-900">
                              {cat.name}
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-1">
                              <span className="font-mono">{cat.unit || "คู่"}</span>
                              {cat.price > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="font-black text-teal-800 font-mono">
                                    ฿{cat.price.toLocaleString()}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            className="h-7 px-2 text-[11px] font-bold bg-white text-slate-800 border border-slate-300 group-hover:bg-teal-700 group-hover:text-white group-hover:border-teal-700 shrink-0 shadow-2xs"
                          >
                            <Plus className="h-3 w-3 mr-0.5" /> เพิ่ม
                          </Button>
                        </div>
                      );
                    })}

                    {filteredCatalog.length === 0 && (
                      <div className="col-span-full py-6 text-center text-xs text-slate-400">
                        ไม่พบรายการที่ค้นหา
                      </div>
                    )}
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
                  </CardHeader>
                  <CardContent className="p-4">
                    {pendingDOs.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-3">
                        ไม่มีใบส่งของหรือใบแจ้งหนี้ที่ค้างชำระในระบบ
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
                      ระบุจำนวนและราคาต่อหน่วย
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddBlankItem}
                    className="text-xs gap-1 h-8"
                  >
                    <Plus className="h-3.5 w-3.5" /> เพิ่มแถวเอง
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
                        {items.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-6 text-center text-slate-400">
                              ยังไม่มีรายการ กดเลือกจากรายการบริการด้านบน หรือกด "เพิ่มแถวเอง"
                            </td>
                          </tr>
                        ) : (
                          items.map((item, idx) => (
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
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Right Column: Summary & Numbering Preview (5 cols) ── */}
            <div className="lg:col-span-5 space-y-6">
              <Card className="border-slate-200 bg-slate-50/50 shadow-xs">
                <CardHeader className="border-b border-slate-200 pb-3">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>สรุปเอกสาร (Summary)</span>
                    <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200 font-mono">
                      {DOC_TYPE_CONFIG[docType].prefix}-{issueDate.replace(/-/g, "")}-XXXX
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
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
                    {grandTotal > 0 && (
                      <div className="text-[11px] text-slate-500 text-right italic">
                        ({thaiBahtText(grandTotal)})
                      </div>
                    )}
                  </div>

                  {/* Dynamic PromptPay Target */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                      <QrCode className="h-4 w-4 text-teal-700" />
                      <span>PromptPay Dynamic QR</span>
                    </div>
                    <Input
                      value={promptPayTarget}
                      onChange={(e) => setPromptPayTarget(e.target.value)}
                      placeholder="เบอร์โทร หรือ เลขประจำตัวผู้เสียภาษี 13 หลัก"
                      className="h-8 text-xs font-mono"
                    />
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
                        <span>ออกเอกสารเลขที่ {createdDoc.docNumber} สำเร็จ!</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : (
        /* ── HISTORY & CONVERSION PIPELINE VIEW ── */
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold">รายการเอกสารทั้งหมดในระบบ</CardTitle>
              <CardDescription className="text-xs">
                สามารถกดแปลงเอกสาร (Convert) ตามสายงานได้ทันที
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">เลขที่เอกสาร</th>
                    <th className="px-4 py-3">ประเภท</th>
                    <th className="px-4 py-3">ลูกค้า</th>
                    <th className="px-4 py-3">วันที่</th>
                    <th className="px-4 py-3 text-right">ยอดสุทธิ</th>
                    <th className="px-4 py-3 text-center">สถานะ</th>
                    <th className="px-4 py-3 text-center">แปลงเอกสารต่อไป</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {existingDocs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        ยังไม่มีเอกสารในระบบ สามารถกด "ออกเอกสารใหม่" เพื่อเริ่มต้น
                      </td>
                    </tr>
                  ) : (
                    existingDocs.map((doc) => {
                      const nextTypes = DOC_TYPE_CONFIG[doc.doc_type as DocumentType]?.nextTypes || [];
                      return (
                        <tr key={doc.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-teal-800">{doc.doc_number}</span>
                            {doc.ref_parent_doc_number && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                แปลงจาก: {doc.ref_parent_doc_number}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-[10px]">
                              {DOC_TYPE_CONFIG[doc.doc_type as DocumentType]?.labelTh || doc.doc_type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {doc.ext_contacts?.company_name || "-"}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-500">
                            {doc.issue_date}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                            ฿{Number(doc.grand_total).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${
                                doc.status === "PAID"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : doc.status === "CONVERTED"
                                  ? "bg-blue-100 text-blue-800"
                                  : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {doc.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {nextTypes.map((nxt) => (
                                <Button
                                  key={nxt}
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending || doc.status === "CONVERTED"}
                                  onClick={() => handleConvert(doc.id, nxt)}
                                  className="h-6 text-[10px] gap-1 px-2 border-teal-200 text-teal-800 hover:bg-teal-50"
                                >
                                  <Repeat className="h-2.5 w-2.5" /> ➔ {DOC_TYPE_CONFIG[nxt].prefix}
                                </Button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
