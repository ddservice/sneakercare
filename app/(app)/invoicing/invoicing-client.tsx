"use client";

import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSmartAccDocument,
  convertDocument,
  deleteSmartAccDocument,
  voidSmartAccDocument,
  issueSmartAccDocument,
  lookupDbdCompany,
  type CreateDocumentPayload,
  type DocumentItemInput,
  type CatalogItem,
  type SmartAccDocument,
  type PendingDeliveryOrderRow,
} from "@/app/actions/smartacc-documents";
import { DOC_TYPE_CONFIG, type DocumentType } from "@/lib/smartacc/types";
import { canConvertDocument, canDeleteDocument, canVoidDocument } from "@/lib/smartacc/lifecycle";
import { canCorrectParent, isCorrectionType } from "@/lib/smartacc/correction";
import { canIssueOfficialNumber, consumesOfficialNumberOnCreate, isDraftNumber } from "@/lib/smartacc/issue";
import { resolveDocumentSeller } from "@/lib/smartacc/snapshot";
import { thaiBahtText } from "@/lib/smartacc/baht-text";
import { thaiOfficialDate } from "@/lib/thai-months";
import {
  defaultChargeVat,
  documentVatRate,
  settleDocumentVat,
  vatChoiceAllowed,
} from "@/lib/vat";
import { Button } from "@/components/ui/button";
import { PrintModalPortal } from "@/components/print-modal-portal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/inventory-shell";
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
  History,
} from "lucide-react";

// อนุมานจาก query จริงของ fetchPendingDeliveryOrders() — เดิมประกาศมือแล้วไม่ตรงกับฐานข้อมูล
// จน page.tsx ต้องใส่ `as any` ปิดปาก TypeScript ตอนส่ง prop
export type PendingDeliveryOrder = PendingDeliveryOrderRow;

import type { ShopProfile } from "@/app/actions/shop-settings";
import { errorMessage } from "@/lib/errors";
import { ModalBackdrop } from "@/components/modal-shell";
import { PageHeader } from "@/components/page-header";
import { UnderlineNav } from "@/components/underline-nav";

const DOC_STATUS_TH: Record<string, string> = {
  DRAFT: "ฉบับร่าง",
  PAID: "ชำระแล้ว",
  CONVERTED: "แปลงแล้ว",
  VOID: "ยกเลิกแล้ว",
};

function formatAmount(n: number): string {
  return Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function OfficialDocument({
  doc,
  shopProfile,
}: {
  doc: SmartAccDocument;
  shopProfile?: ShopProfile;
}) {
  const cfg = DOC_TYPE_CONFIG[doc.doc_type as DocumentType];
  const vat = Number(doc.vat_amount || 0);
  const subtotal = Number(doc.subtotal_amount || doc.grand_total);
  const items = doc.ext_document_items ?? [];
  const { seller } = resolveDocumentSeller(doc.notes, shopProfile ?? {});
  const signatory = seller.signatoryName || seller.name || "ยังไม่ได้ตั้งชื่อกิจการ";

  return (
    <div className="printable-area bg-white p-8 text-[12px] leading-relaxed text-black">
      {doc.status === "VOID" ? (
        <div className="mb-3 border-2 border-black px-3 py-1 text-center text-[14px] font-semibold tracking-wide">
          ยกเลิกแล้ว — เลขที่ {doc.doc_number} ยังใช้ต่อไม่ได้
        </div>
      ) : isDraftNumber(doc.doc_number) ? (
        <div className="mb-3 border border-black px-3 py-1 text-center text-[12px] font-semibold">
          ฉบับร่าง — ยังไม่มีเลขทางการ
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-6 border-b border-black pb-3">
        <div className="flex min-w-0 items-start gap-3">
          {shopProfile?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- โลโก้ร้านเป็น URL จาก /settings ใช้บนหัวเอกสาร A4
            <img src={shopProfile.logoUrl} alt="" className="h-14 w-14 shrink-0 object-contain" />
          ) : null}
          <div className="min-w-0">
            {/* fallback เป็นข้อความกลาง ห้าม hardcode ชื่อ/เลขผู้เสียภาษีของ tenant ใด */}
            <div className="text-[15px] font-semibold">{seller.name || "ยังไม่ได้ตั้งค่าชื่อกิจการ — ไปที่ /settings"}</div>
            <div className="mt-0.5 text-[11px]">{seller.address || "ยังไม่ได้ตั้งค่าที่อยู่"}</div>
            <div className="text-[11px]">
              เลขประจำตัวผู้เสียภาษี {seller.taxId || "-"}
              {seller.phone ? `  โทร. ${seller.phone}` : ""}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[16px] font-semibold">{cfg?.labelTh || doc.doc_type}</div>
          {cfg?.labelEn ? <div className="text-[10px] tracking-wide text-neutral-600">{cfg.labelEn}</div> : null}
          <div className="mt-2 space-y-0.5 text-[11px]">
            <div>เลขที่ {doc.doc_number}</div>
            <div>วันที่ {thaiOfficialDate(doc.issue_date)}</div>
            {doc.due_date ? <div>ครบกำหนด {thaiOfficialDate(doc.due_date)}</div> : null}
          </div>
        </div>
      </div>

      <div className="mt-3 border border-black p-3 text-[11px]">
        <div className="font-semibold">ลูกค้า</div>
        <div className="mt-0.5 text-[13px] font-semibold">
          {doc.ext_contacts?.company_name || "ยังไม่ได้ระบุชื่อลูกค้า"}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-0.5">
          <span>เลขประจำตัวผู้เสียภาษี {doc.ext_contacts?.tax_id || "-"}</span>
          <span>สาขา {doc.ext_contacts?.branch_code || "00000"}</span>
        </div>
        {doc.ext_contacts?.phone ? <div>โทร {doc.ext_contacts.phone}</div> : null}
        <div>ที่อยู่ {doc.ext_contacts?.address || "-"}</div>
      </div>

      <table className="mt-3 w-full border-collapse border border-black text-[11px]">
        <thead>
          <tr>
            <th className="w-10 border border-black bg-neutral-200 px-2 py-1.5 font-semibold">ลำดับ</th>
            <th className="border border-black bg-neutral-200 px-2 py-1.5 text-left font-semibold">รายการ</th>
            <th className="w-16 border border-black bg-neutral-200 px-2 py-1.5 font-semibold">จำนวน</th>
            <th className="w-28 border border-black bg-neutral-200 px-2 py-1.5 font-semibold">ราคาต่อหน่วย</th>
            <th className="w-28 border border-black bg-neutral-200 px-2 py-1.5 font-semibold">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {(items.length > 0 ? items : [{ id: "empty", item_name: "—", quantity: 1, unit_price: 0, total_line_amount: 0 }]).map((it, idx) => (
            <tr key={it.id || idx}>
              <td className="border border-black px-2 py-1.5 text-center tabular-nums">{idx + 1}</td>
              <td className="border border-black px-2 py-1.5">{it.item_name}</td>
              <td className="border border-black px-2 py-1.5 text-right tabular-nums">{it.quantity}</td>
              <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                {formatAmount(Number(it.unit_price))}
              </td>
              <td className="border border-black px-2 py-1.5 text-right tabular-nums">
                {formatAmount(Number(it.total_line_amount || Number(it.quantity) * Number(it.unit_price)))}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={3} rowSpan={vat > 0 ? 3 : 2} className="border border-black px-2 py-2 align-top">
              <div className="font-semibold">จำนวนเงินรวมทั้งสิ้น (ตัวอักษร)</div>
              <div className="mt-1">({thaiBahtText(Number(doc.grand_total || 0))})</div>
            </td>
            <td className="border border-black px-2 py-1.5 text-right">รวมมูลค่า</td>
            <td className="border border-black px-2 py-1.5 text-right tabular-nums">{formatAmount(subtotal)}</td>
          </tr>
          {vat > 0 ? (
            <tr>
              <td className="border border-black px-2 py-1.5 text-right">ภาษีมูลค่าเพิ่ม 7%</td>
              <td className="border border-black px-2 py-1.5 text-right tabular-nums">{formatAmount(vat)}</td>
            </tr>
          ) : null}
          <tr>
            <td className="border border-black px-2 py-1.5 text-right font-semibold">ยอดรวมสุทธิ</td>
            <td className="border border-black px-2 py-1.5 text-right font-semibold tabular-nums">
              {formatAmount(Number(doc.grand_total))}
            </td>
          </tr>
        </tfoot>
      </table>

      {vat === 0 && doc.doc_type !== "QUOTATION" && doc.doc_type !== "DO" ? (
        <div className="mt-2 text-[11px]">เอกสารนี้ไม่รวมภาษีมูลค่าเพิ่ม</div>
      ) : null}

      <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[11px]">
        <div>
          <div className="mx-auto mb-8 h-10 w-44 border-b border-black" />
          <div>ลงชื่อ ................................ ผู้รับเอกสาร</div>
          <div className="mt-1">วันที่ ....... / ....... / .......</div>
        </div>
        <div>
          {shopProfile?.signatureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ลายเซ็นจาก /settings
            <img src={shopProfile.signatureUrl} alt="" className="mx-auto mb-1 h-10 max-w-[180px] object-contain" />
          ) : (
            <div className="mx-auto mb-8 h-10 w-44 border-b border-black" />
          )}
          <div>ลงชื่อ ................................ ผู้มีอำนาจลงนาม</div>
          <div className="mt-1">({signatory})</div>
        </div>
      </div>
    </div>
  );
}

export function InvoicingClient({
  pendingDOs,
  catalog,
  existingDocs,
  shopProfile,
}: {
  pendingDOs: PendingDeliveryOrder[];
  catalog: CatalogItem[];
  existingDocs: SmartAccDocument[];
  shopProfile?: ShopProfile;
}) {
  const router = useRouter();
  const [docType, setDocType] = useState<DocumentType>("INVOICE");
  const vatBranchSelected = shopProfile?.vatBranchSelected !== false;
  const vatRegistered = Boolean(vatBranchSelected && shopProfile?.vatRegistered !== false);
  const vatBranchName = shopProfile?.vatBranchName?.trim() || "";
  const vatLockReason = !vatRegistered
    ? !vatBranchSelected
      ? "เลือกสาขาที่หัวเว็บก่อน — VAT เป็นของแต่ละสาขา (คนละนิติบุคคล)"
      : vatBranchName
        ? `สาขา ${vatBranchName} ยังไม่จด VAT จึงออกใบกำกับภาษีไม่ได้ — ตั้งค่าในการ์ดสาขาที่ /settings`
        : "สาขานี้ยังไม่จด VAT จึงออกใบกำกับภาษีไม่ได้ — ตั้งค่าในการ์ดสาขาที่ /settings"
    : null;
  const [chargeVat, setChargeVat] = useState(() =>
    defaultChargeVat(Boolean(shopProfile?.vatBranchSelected !== false && shopProfile?.vatRegistered !== false), "INVOICE")
  );
  const [isPending, startTransition] = useTransition();
  const [removedDocIds, setRemovedDocIds] = useState<string[]>([]);
  const visibleDocs = useMemo(
    () => existingDocs.filter((doc) => !removedDocIds.includes(doc.id)),
    [existingDocs, removedDocIds]
  );

  // Contact / Customer State
  const [companyName, setCompanyName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [branchCode, setBranchCode] = useState("00000");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  // Document meta
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  // lazy initializer: คำนวณครั้งเดียวตอน mount ไม่ใช่ทุก render
  // (ค่าเริ่มต้นที่อ้างเวลาปัจจุบันต้องเขียนแบบนี้เสมอ ไม่งั้นค่าจะขยับทุกครั้งที่ re-render)
  const [dueDate, setDueDate] = useState(() =>
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  // ค่าคงที่ 30 วัน — ยังไม่มี UI ให้แก้ ถ้าจะทำให้แก้ได้ค่อยเปลี่ยนกลับเป็น useState
  const creditTermDays = 30;
  const notes = "";
  const [promptPayTarget, setPromptPayTarget] = useState(
    shopProfile?.promptPayId || shopProfile?.taxId || ""
  );

  // Line items - Start clean, no dummy items
  const [items, setItems] = useState<DocumentItemInput[]>([]);

  // Selected DOs for Billing Note
  const [selectedDoIds, setSelectedDoIds] = useState<string[]>([]);
  const [parentDocId, setParentDocId] = useState("");

  // Catalog UI State
  const [catalogSearch, setCatalogSearch] = useState("");
  const [printingDoc, setPrintingDoc] = useState<SmartAccDocument | null>(null);
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
  const vatRate = documentVatRate(vatRegistered, docType, vatChoiceAllowed(docType) ? chargeVat : undefined);
  const totals = settleDocumentVat(subtotal, vatRate);
  const vatAmount = totals.vatAmount;
  const grandTotal = totals.grandTotal;

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
        toast.success(`เจอข้อมูลที่เคยบันทึกไว้: ${res.companyName}`);
      } else {
        toast.error(
          "ยังไม่เคยบันทึกลูกค้ารายนี้ไว้ — กรอกข้อมูลด้านล่างเองครั้งนี้ ระบบจะจำไว้ให้ค้นหาเจอในครั้งถัดไป"
        );
      }
    } catch {
      toast.error("เกิดข้อผิดพลาดในการค้นหา");
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

  // value เป็น union ของทุกชนิดที่ฟิลด์ใน DocumentItemInput เป็นได้ (string สำหรับชื่อ,
  // number สำหรับจำนวน/ราคา) — ช่อง input ส่งมาเป็น string แล้วแปลงเป็นตัวเลขข้างล่างอีกที
  function handleUpdateItem(
    index: number,
    field: keyof DocumentItemInput,
    value: DocumentItemInput[keyof DocumentItemInput]
  ) {
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
    if (docType === "TAX_INVOICE" && vatLockReason) {
      toast.error(vatLockReason);
      return;
    }
    if (!companyName.trim()) {
      toast.error("กรุณากรอกชื่อลูกค้าหรือชื่อบริษัท — เอกสารบัญชีต้องระบุผู้รับเอกสาร");
      return;
    }
    if (items.length === 0 || subtotal <= 0) {
      toast.error("กรุณาระบุรายการสินค้า/บริการอย่างน้อย 1 รายการ");
      return;
    }
    if (isCorrectionType(docType) && !parentDocId) {
      toast.error("เลือกเอกสารต้นทางก่อนออกใบลดหนี้/เพิ่มหนี้");
      return;
    }

    const parentDoc = visibleDocs.find((d) => d.id === parentDocId);

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
      chargeVat: vatChoiceAllowed(docType) ? chargeVat : undefined,
      ...(parentDoc
        ? { refParentDocId: parentDoc.id, refParentDocNumber: parentDoc.doc_number }
        : {}),
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
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(errorMessage(err, "เกิดข้อผิดพลาดในการสร้างเอกสาร"));
      }
    });
  }

  async function handleConvert(docId: string, targetType: DocumentType) {
    startTransition(async () => {
      try {
        const res = await convertDocument(docId, targetType);
        if (res.success) {
          toast.success(`แปลงเอกสารเป็น ${res.docNumber} (${DOC_TYPE_CONFIG[targetType].labelTh}) เรียบร้อย`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(errorMessage(err, "เกิดข้อผิดพลาดในการแปลงเอกสาร"));
      }
    });
  }

  function handleDelete(doc: SmartAccDocument) {
    const typeLabel = DOC_TYPE_CONFIG[doc.doc_type as DocumentType]?.labelTh || doc.doc_type;
    const customer = doc.ext_contacts?.company_name || "ยังไม่มีชื่อลูกค้า";
    const amount = Number(doc.grand_total).toLocaleString("th-TH", { minimumFractionDigits: 2 });
    if (
      !confirm(
        `ลบเอกสาร ${doc.doc_number} (${typeLabel}) ของ ${customer} ยอด ฿${amount}?\n\nเลขที่นี้จะไม่ถูกนำกลับมาใช้ — ถ้าเป็นใบกำกับภาษีที่ออกให้ลูกค้าจริงแล้ว ไม่ควรลบ`
      )
    ) {
      return;
    }

    startTransition(async () => {
      try {
        const res = await deleteSmartAccDocument(doc.id);
        if (res.success) {
          setRemovedDocIds((prev) => (prev.includes(doc.id) ? prev : [...prev, doc.id]));
          if (printingDoc?.id === doc.id) setPrintingDoc(null);
          toast.success(`ลบเอกสาร ${res.docNumber} แล้ว`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(errorMessage(err, "ไม่สามารถลบเอกสารได้"));
      }
    });
  }

  function handleVoid(doc: SmartAccDocument) {
    const typeLabel = DOC_TYPE_CONFIG[doc.doc_type as DocumentType]?.labelTh || doc.doc_type;
    const reason = window.prompt(
      `ยกเลิก ${doc.doc_number} (${typeLabel}) — เลขที่นี้ยังเก็บไว้และไม่ถูกนำกลับมาใช้\nระบุเหตุผล:`
    );
    if (reason == null) return;
    if (!reason.trim()) {
      toast.error("กรุณาระบุเหตุผลที่ยกเลิก");
      return;
    }

    startTransition(async () => {
      try {
        const res = await voidSmartAccDocument(doc.id, reason);
        if (res.success) {
          toast.success(`ยกเลิกเอกสาร ${res.docNumber} แล้ว — เลขที่ยังอยู่ในประวัติ`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(errorMessage(err, "ไม่สามารถยกเลิกเอกสารได้"));
      }
    });
  }

  function handleIssue(doc: SmartAccDocument) {
    if (
      !confirm(
        `ออกเลขทางการให้ ${doc.doc_number}?\nเลขร่างจะถูกแทนที่ และตัวนับจะเดินไปหนึ่งเบอร์`
      )
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await issueSmartAccDocument(doc.id);
        if (res.success) {
          toast.success(`ออกเลข ${res.docNumber} แล้ว`);
          router.refresh();
        } else {
          toast.error(res.error);
        }
      } catch (err) {
        toast.error(errorMessage(err, "ไม่สามารถออกเลขได้"));
      }
    });
  }

  function selectDocType(type: DocumentType) {
    if (type === "TAX_INVOICE" && vatLockReason) {
      toast.error(vatLockReason);
      return;
    }
    setDocType(type);
    setChargeVat(defaultChargeVat(vatRegistered, type));
    if (!isCorrectionType(type)) setParentDocId("");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="ออกเอกสาร"
        description="ร่าง QA/DO/INV/BL ยังไม่กินเลขทางการ · ใบกำกับ ใบเสร็จ ใบลด-เพิ่มหนี้ออกเลขทันที · หัวบิลใช้ภาพผู้ขายตอนออก"
      />
      <UnderlineNav
        aria-label="เมนูออกเอกสาร"
        value={activeView}
        onChange={(id) => setActiveView(id as "create" | "history")}
        items={[
          { id: "create", label: "ออกเอกสารใหม่", icon: Plus },
          { id: "history", label: `ประวัติเอกสาร (${visibleDocs.length})`, icon: History },
        ]}
      />

      {activeView === "create" ? (
        <>
          {/* Document Type Selector */}
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            {(Object.keys(DOC_TYPE_CONFIG) as DocumentType[]).map((type) => {
              const lockedTax = type === "TAX_INVOICE" && !vatRegistered;
              return (
              <button
                key={type}
                type="button"
                onClick={() => selectDocType(type)}
                title={lockedTax ? vatLockReason ?? "ยังไม่จด VAT — ออกใบกำกับภาษีไม่ได้" : undefined}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  docType === type
                    ? "bg-slate-900 text-white"
                    : lockedTax
                    ? "border border-slate-200 bg-slate-50 text-slate-400"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span className="font-mono">{DOC_TYPE_CONFIG[type].prefix}</span>
                <span>:</span>
                <span>{DOC_TYPE_CONFIG[type].labelTh}</span>
              </button>
              );
            })}
          </div>
          {vatLockReason ? (
            <p className="text-[11px] text-amber-800">{vatLockReason}</p>
          ) : vatBranchName ? (
            <p className="text-[11px] text-slate-500">VAT ของสาขา {vatBranchName} (จดทะเบียนแล้ว — เลือกบิลเงินสดหรือบิล VAT ต่อใบได้)</p>
          ) : null}
          {isCorrectionType(docType) ? (
            <div className="space-y-1.5 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2">
              <label className="text-[11px] font-semibold text-amber-900" htmlFor="correction-parent">
                เอกสารต้นทาง (ใบแจ้งหนี้ / ใบกำกับ / ใบเสร็จ)
              </label>
              <select
                id="correction-parent"
                value={parentDocId}
                onChange={(e) => {
                  const id = e.target.value;
                  setParentDocId(id);
                  const parent = visibleDocs.find((d) => d.id === id);
                  if (parent?.ext_contacts) {
                    setCompanyName(parent.ext_contacts.company_name || "");
                    setTaxId(parent.ext_contacts.tax_id || "");
                    setBranchCode(parent.ext_contacts.branch_code || "00000");
                    setAddress(parent.ext_contacts.address || "");
                    setPhone(parent.ext_contacts.phone || "");
                    setEmail(parent.ext_contacts.email || "");
                  }
                }}
                className="h-9 w-full rounded-md border border-amber-300 bg-white px-2 text-xs"
              >
                <option value="">เลือกเอกสารต้นทาง</option>
                {visibleDocs
                  .filter((d) => canCorrectParent(d.doc_type, d.status))
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.doc_number} · {Number(d.grand_total).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                    </option>
                  ))}
              </select>
              <p className="text-[11px] leading-5 text-amber-900/80">
                ลดหนี้หลายใบรวมกันห้ามเกินยอดต้นทาง (+ ใบเพิ่มหนี้) · ไม่กลับรายการยอดขายร้าน · ยังไม่ใช่แบบยื่นสรรพากร
              </p>
            </div>
          ) : null}

          {/* ── Main Form Grid ── */}
          <div className="grid gap-8 lg:grid-cols-12">
            {/* ── Left Column: Form Builder (7 cols) ── */}
            <div className="lg:col-span-7 space-y-6">
              {/* Customer Info Card */}
              <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                        <Building2 className="h-4 w-4 text-slate-500" />
                        ข้อมูลลูกค้า
                      </CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        ชื่อผู้รับเอกสารตามที่อยู่จดทะเบียน — ใช้บนใบเสนอราคาถึงใบกำกับภาษี
                      </CardDescription>
                    </div>
                    {shopProfile && (
                      <div className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 sm:flex">
                        {shopProfile.logoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element -- โลโก้ร้านเป็น URL ที่เจ้าของวางเองจากโฮสต์ใดก็ได้ และใช้ในเอกสาร A4 ที่สั่งพิมพ์ (next/image ต้องประกาศ remotePatterns ล่วงหน้า และแทรก wrapper ที่กวนการจัดหน้ากระดาษ)
                          <img src={shopProfile.logoUrl} alt="" className="h-4 w-4 rounded object-contain" />
                        )}
                        <span>ผู้ออกเอกสาร: {shopProfile.name}</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-5 space-y-4">
                  {/* DBD Auto-Fill Bar */}
                  <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <Label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                      <Search className="h-3.5 w-3.5 text-slate-500" />
                      ค้นหาลูกค้าที่เคยออกเอกสารด้วยกัน
                    </Label>
                    <p className="text-[11px] text-slate-500">
                      ค้นจากรายชื่อในระบบนี้เท่านั้น ไม่ได้เชื่อมกรมพัฒนาธุรกิจการค้า — ลูกค้าใหม่กรอกเองครั้งแรก
                    </p>
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
                        placeholder="เลขผู้เสียภาษี 13 หลัก หรือชื่อลูกค้า"
                        className="h-9 bg-white font-mono text-xs"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={isSearchingDbd}
                        onClick={() => handleDbdSearch()}
                        className="h-9 shrink-0 gap-1 bg-slate-900 px-4 text-xs font-medium text-white hover:bg-slate-800"
                      >
                        {isSearchingDbd ? "กำลังค้นหา..." : "ค้นหา"}
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
                            className="text-[11px] font-medium text-slate-600 hover:underline"
                          >
                            ค้นจากเลขนี้
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
              <Card className="overflow-hidden border-slate-200 bg-white shadow-xs">
                <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3.5">
                  <div>
                    <CardTitle className="text-xs font-semibold text-slate-900">
                      เลือกรายการจากแคตตาล็อก
                    </CardTitle>
                    <CardDescription className="text-[11px] text-slate-500">
                      คลิกเพื่อใส่ในเอกสาร — คำนวณยอดให้อัตโนมัติ
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
                      { id: "all", label: "ทั้งหมด", count: catalog.length },
                      { id: "package", label: "แพ็กเกจ", count: catalog.filter((c) => c.category === "package").length },
                      { id: "treatment", label: "บริการเสริม", count: catalog.filter((c) => ["treatment", "cleaning", "repair", "protection"].includes(c.category)).length },
                      { id: "product", label: "สินค้า", count: catalog.filter((c) => c.category === "product").length },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setCatalogCategoryTab(tab.id)}
                        className={`cursor-pointer rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                          catalogCategoryTab === tab.id
                            ? "bg-slate-900 text-white"
                            : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {tab.label} <span className="text-[10px] opacity-70">({tab.count})</span>
                      </button>
                    ))}
                  </div>

                  {/* Filtered Grid Cards */}
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-56 overflow-y-auto pr-1">
                    {filteredCatalog.map((cat) => {
                      return (
                        <div
                          key={cat.id}
                          onClick={() => handleAddCatalogItem(cat)}
                          className="group flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-white p-2.5 text-xs transition-colors hover:border-slate-300 hover:bg-slate-50"
                        >
                          <div className="min-w-0 space-y-0.5 pr-2">
                            <div className="truncate font-medium text-slate-900">
                              {cat.name}
                            </div>
                            <div className="flex items-center gap-1 text-[11px] text-slate-500">
                              <span>{cat.unit || "คู่"}</span>
                              {cat.price > 0 && (
                                <>
                                  <span>·</span>
                                  <span className="font-semibold tabular-nums text-slate-800">
                                    {formatAmount(cat.price)}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 px-2 text-[11px] font-medium"
                          >
                            <Plus className="mr-0.5 h-3 w-3" /> เพิ่ม
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
                <Card className="border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 shadow-xs">
                  <CardHeader className="border-b border-slate-200 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Layers className="h-4 w-4 text-slate-500" />
                      เลือกใบส่งของ / ใบแจ้งหนี้ที่ค้างชำระ
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
                            className={`flex cursor-pointer items-center justify-between rounded-lg border p-2.5 text-xs transition-colors ${
                              selectedDoIds.includes(doItem.id)
                                ? "border-slate-900 bg-slate-100 font-medium"
                                : "border-slate-200 bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={selectedDoIds.includes(doItem.id)}
                                onChange={() => {}}
                                className="rounded"
                              />
                              <div>
                                <span className="font-medium tabular-nums text-slate-900">{doItem.doc_number}</span>
                                <span className="ml-2 text-slate-500">{thaiOfficialDate(doItem.issue_date)}</span>
                              </div>
                            </div>
                            <div className="font-semibold tabular-nums text-slate-900">
                              {formatAmount(doItem.grand_total)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Line Items Table */}
              <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
                <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-semibold">รายการสินค้า / บริการ</CardTitle>
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
                      <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
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
                              ยังไม่มีรายการ กดเลือกจากรายการบริการด้านบน หรือกด &ldquo;เพิ่มแถวเอง&rdquo;
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
                              <td className="p-2 text-right font-semibold tabular-nums text-slate-800">
                                {formatAmount(item.totalLineAmount)}
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
                  <CardTitle className="flex items-center justify-between text-sm font-semibold">
                    <span>สรุปเอกสาร</span>
                    <span className="font-mono text-[11px] font-medium text-slate-500">
                      {consumesOfficialNumberOnCreate(docType)
                        ? `${DOC_TYPE_CONFIG[docType].prefix}-${issueDate.replace(/-/g, "")}-XXXX`
                        : `DRAFT-${issueDate.replace(/-/g, "")}-XXXX`}
                    </span>
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

                  {vatChoiceAllowed(docType) && vatRegistered ? (
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-medium text-slate-600">ประเภทบิล</Label>
                      <SegmentedControl
                        value={chargeVat ? "vat" : "cash"}
                        onChange={(id) => setChargeVat(id === "vat")}
                        options={[
                          { value: "cash", label: "บิลเงินสด" },
                          { value: "vat", label: "บิล VAT 7%" },
                        ]}
                      />
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      {!vatBranchSelected
                        ? "เลือกสาขาที่หัวเว็บก่อน — VAT เป็นของแต่ละสาขา (คนละนิติบุคคล)"
                        : !vatRegistered
                        ? vatBranchName
                          ? `สาขา ${vatBranchName} ยังไม่จด VAT — เอกสารเป็นบิลเงินสดทั้งหมด ตั้งค่าได้ที่การ์ดสาขาใน /settings`
                          : "สาขานี้ยังไม่จด VAT — เอกสารเป็นบิลเงินสดทั้งหมด ตั้งค่าได้ที่การ์ดสาขาใน /settings"
                        : docType === "TAX_INVOICE"
                        ? "ใบกำกับภาษีคิด VAT 7% ตามที่จดทะเบียน"
                        : "ใบเสนอราคาและใบส่งของยังไม่คิด VAT"}
                    </p>
                  )}

                  {/* Monetary Aggregation */}
                  <div className="space-y-2 border-t border-slate-200 pt-3 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>มูลค่ารวม</span>
                      <span className="font-semibold tabular-nums">{formatAmount(subtotal)}</span>
                    </div>
                    {vatRate > 0 && (
                      <div className="flex justify-between text-slate-600">
                        <span>ภาษีมูลค่าเพิ่ม 7%</span>
                        <span className="font-semibold tabular-nums">+{formatAmount(vatAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-slate-200 pt-2 text-sm font-semibold text-slate-900">
                      <span>ยอดสุทธิ</span>
                      <span className="tabular-nums text-base">{formatAmount(grandTotal)}</span>
                    </div>
                    {grandTotal > 0 && (
                      <div className="text-[11px] text-slate-500 text-right italic">
                        ({thaiBahtText(grandTotal)})
                      </div>
                    )}
                  </div>

                  {/* Dynamic PromptPay Target */}
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-800">
                      <QrCode className="h-4 w-4 text-slate-500" />
                      <span>พร้อมเพย์</span>
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
                    className="h-11 w-full bg-slate-900 text-sm font-medium text-white shadow-xs hover:bg-slate-800"
                  >
                    {isPending ? "กำลังบันทึกเอกสาร..." : `ออกเอกสาร ${DOC_TYPE_CONFIG[docType].labelTh}`}
                  </Button>

                  {createdDoc && (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-medium">
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
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <CardTitle className="text-sm font-semibold">ประวัติเอกสาร</CardTitle>
              <CardDescription className="text-xs">
                พิมพ์ แปลงตามสายงาน ลบฉบับร่างที่ยังไม่มีคนอ้าง หรือยกเลิกเอกสารที่ออกแล้ว — เลขที่ยกเลิก/ลบไม่คืนตัวนับ
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">เลขที่</th>
                    <th className="px-4 py-3 font-medium">ประเภท</th>
                    <th className="px-4 py-3 font-medium">ลูกค้า</th>
                    <th className="px-4 py-3 font-medium">วันที่</th>
                    <th className="px-4 py-3 text-right font-medium">ยอดสุทธิ</th>
                    <th className="px-4 py-3 font-medium">สถานะ</th>
                    <th className="px-4 py-3 text-right font-medium">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleDocs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        ยังไม่มีเอกสารในระบบ สามารถกด &ldquo;ออกเอกสารใหม่&rdquo; เพื่อเริ่มต้น
                      </td>
                    </tr>
                  ) : (
                    visibleDocs.map((doc) => {
                      const cfg = DOC_TYPE_CONFIG[doc.doc_type as DocumentType];
                      const nextTypes = cfg?.nextTypes || [];
                      const life = {
                        status: doc.status,
                        hasBillingRef: false,
                        docType: doc.doc_type,
                        docNumber: doc.doc_number,
                      };
                      const showDelete = canDeleteDocument(life);
                      const showVoid = canVoidDocument(life);
                      const showIssue = canIssueOfficialNumber(doc.status, doc.doc_number);
                      return (
                        <tr key={doc.id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <span className="font-medium tabular-nums text-slate-900">{doc.doc_number}</span>
                            {doc.ref_parent_doc_number && (
                              <div className="mt-0.5 text-[11px] text-slate-400">
                                จาก {doc.ref_parent_doc_number}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{cfg?.labelTh || doc.doc_type}</td>
                          <td className="px-4 py-3 text-slate-800">
                            {doc.ext_contacts?.company_name || "ยังไม่มีชื่อลูกค้า"}
                          </td>
                          <td className="px-4 py-3 text-slate-500">
                            {thaiOfficialDate(doc.issue_date)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                            {formatAmount(Number(doc.grand_total))}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {DOC_STATUS_TH[doc.status] || doc.status}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                              <button
                                type="button"
                                onClick={() => setPrintingDoc(doc)}
                                className="text-xs font-medium text-slate-700 hover:text-slate-900"
                              >
                                พิมพ์
                              </button>
                              {nextTypes
                                .filter((nxt) => vatRegistered || nxt !== "TAX_INVOICE")
                                .map((nxt) => (
                                <button
                                  key={nxt}
                                  type="button"
                                  disabled={
                                    isPending ||
                                    doc.status === "VOID" ||
                                    (!isCorrectionType(nxt) && !canConvertDocument(doc.status))
                                  }
                                  onClick={() => handleConvert(doc.id, nxt)}
                                  className="text-xs font-medium text-slate-700 hover:text-slate-900 disabled:text-slate-300"
                                >
                                  เป็น {DOC_TYPE_CONFIG[nxt].labelTh}
                                </button>
                              ))}
                              {showIssue ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleIssue(doc)}
                                className="text-xs font-medium text-teal-800 hover:text-teal-900 disabled:text-slate-300"
                              >
                                ออกเลข
                              </button>
                              ) : null}
                              {showDelete ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleDelete(doc)}
                                className="text-xs font-medium text-rose-700 hover:text-rose-800 disabled:text-slate-300"
                              >
                                ลบ
                              </button>
                              ) : null}
                              {showVoid ? (
                              <button
                                type="button"
                                disabled={isPending}
                                onClick={() => handleVoid(doc)}
                                className="text-xs font-medium text-amber-800 hover:text-amber-900 disabled:text-slate-300"
                              >
                                ยกเลิก
                              </button>
                              ) : null}
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

      {printingDoc && (
        <PrintModalPortal>
        <ModalBackdrop
          onClose={() => setPrintingDoc(null)}
          className="bg-black/60 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-[210mm] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-slate-500" />
                <span className="text-sm font-semibold text-slate-900">
                  {DOC_TYPE_CONFIG[printingDoc.doc_type as DocumentType]?.labelTh || "เอกสาร"} {printingDoc.doc_number}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="gap-1.5 bg-slate-900 text-xs font-medium text-white hover:bg-slate-800"
                >
                  <Printer className="h-4 w-4" /> พิมพ์ A4
                </Button>
                <button
                  type="button"
                  onClick={() => setPrintingDoc(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <OfficialDocument
              doc={printingDoc}
              shopProfile={shopProfile}
            />
          </div>
        </ModalBackdrop>
        </PrintModalPortal>
      )}
    </div>
  );
}
