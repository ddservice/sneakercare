"use client";

import { useState, useTransition } from "react";
import {
  generatePndEFilingFile,
  generatePp30VatText,
  digitsOnly,
  type WhtRecord,
  type VatTransaction,
} from "@/lib/smartacc/tax-reports";
import { generateETaxXML } from "@/lib/smartacc/etax-generator";
import { downloadTextFile } from "@/lib/download-file";
import { logTaxFilingExport } from "@/app/actions/smartacc-documents";
import { Button } from "@/components/ui/button";
import { PrintModalPortal } from "@/components/print-modal-portal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { TaxFilingSalesDoc, TaxFilingExpense, TaxFilingWhtCert } from "@/app/actions/smartacc-documents";
import { planTaxRecon } from "@/lib/tax-recon";
import { mergeInputVat } from "@/lib/input-vat";
import { isPeriodClosed } from "@/lib/period-close";
import { closePeriod, reopenPeriod } from "@/app/actions/period-close";
import { addPurchaseVatLine, deletePurchaseVatLine } from "@/app/actions/purchase-vat";
import type { PurchaseVatLine } from "@/lib/purchase-vat";
import { isDraftNumber } from "@/lib/smartacc/issue";
import type { ShopProfile } from "@/app/actions/shop-settings";
import { ModalBackdrop } from "@/components/modal-shell";
import { PageHeader } from "@/components/page-header";
import { UnderlineNav } from "@/components/underline-nav";
import { Tawi50Certificate } from "@/components/tawi50-certificate";
import {
  DEFAULT_TAWI50_CONDITION,
  TAWI50_CONDITIONS,
  formatTawi50Amount,
  type Tawi50ConditionId,
} from "@/lib/wht";
import {
  Landmark,
  FileSpreadsheet,
  Download,
  Code2,
  FileCheck2,
  Calendar,
  Printer,
  Lock,
  Unlock,
} from "lucide-react";

export function TaxFilingClient({
  initialSalesDocs,
  initialExpenses: _initialExpenses,
  initialWht = [],
  initialBooksSales = [],
  initialBooksPayments = [],
  initialCorrectionDocs = [],
  initialClosedPeriods = [],
  initialPurchaseVatLines = [],
  canClosePeriod = false,
  shopProfile,
}: {
  initialSalesDocs: TaxFilingSalesDoc[];
  initialExpenses: TaxFilingExpense[];
  initialWht?: TaxFilingWhtCert[];
  initialBooksSales?: { date: string; total_revenue: number | null; amount_paid: number | null }[];
  initialBooksPayments?: { sale_date: string; amount: number | null }[];
  initialCorrectionDocs?: { doc_type: string; doc_number: string; issue_date: string; status: string; grand_total: number; vat_amount: number | null }[];
  initialClosedPeriods?: string[];
  initialPurchaseVatLines?: PurchaseVatLine[];
  canClosePeriod?: boolean;
  /** ข้อมูลบริษัทจริงจากหน้า /settings — ใช้พิมพ์หัวเอกสารทุกจุดในหน้านี้ ห้าม hardcode ทับ */
  shopProfile?: ShopProfile;
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [closedPeriods, setClosedPeriods] = useState(initialClosedPeriods);
  const [purchaseLines, setPurchaseLines] = useState(initialPurchaseVatLines);
  const [periodPending, startPeriodTransition] = useTransition();
  const [purchasePending, startPurchaseTransition] = useTransition();
  const [purchaseForm, setPurchaseForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    vendorName: "",
    vendorTaxId: "",
    invoiceNumber: "",
    baseAmount: "",
    vatAmount: "",
  });
  const [activeTab, setActiveTab] = useState<"efiling" | "tawi50" | "etax_xml">("efiling");
  const [selectedWhtCert, setSelectedWhtCert] = useState<TaxFilingWhtCert | null>(null);
  const [tawiCondition, setTawiCondition] = useState<Tawi50ConditionId>(DEFAULT_TAWI50_CONDITION);
  const [tawiOtherNote, setTawiOtherNote] = useState("");
  const [tawiCopyNo, setTawiCopyNo] = useState<1 | 2>(1);

  // Calculate real VAT and WHT from database records
  const filteredSales = initialSalesDocs.filter(
    (d) => (d.issue_date || "").startsWith(selectedMonth) && !isDraftNumber(d.doc_number)
  );

  const totalSalesSubtotal = filteredSales.reduce(
    (sum, d) => sum + Number(d.subtotal_amount || 0),
    0
  );
  const totalSalesVat = filteredSales.reduce(
    (sum, d) => sum + Number(d.vat_amount || 0),
    0
  );

  const vatRecords: VatTransaction[] = filteredSales.map((d, index) => ({
    sequence: index + 1,
    invoiceNo: d.doc_number,
    invoiceDate: d.issue_date,
    partnerTaxId: d.ext_contacts?.tax_id || "0000000000000",
    partnerBranch: d.ext_contacts?.branch_code || "00000",
    partnerName: d.ext_contacts?.company_name || "ลูกค้าทั่วไป",
    baseAmount: Number(d.subtotal_amount || 0),
    vatAmount: Number(d.vat_amount || 0),
  }));

  // เฉพาะรายการที่ร้านเป็นผู้หัก (payable) — รายได้ที่ถูกหักไว้ไม่ยื่น ภ.ง.ด.3/53 ในนามผู้จ่าย
  const monthWht = initialWht.filter(
    (r) => r.direction === "payable" && (r.date || "").startsWith(selectedMonth)
  );
  const receivableMonth = initialWht.filter(
    (r) => r.direction === "receivable" && (r.date || "").startsWith(selectedMonth)
  );
  const receivableWithheld = receivableMonth.reduce((sum, r) => sum + r.taxAmount, 0);
  const whtRecords: WhtRecord[] = monthWht.map((r, index) => ({
    sequence: index + 1,
    taxId: r.taxId,
    name: r.name,
    address: r.address || shopProfile?.address || "",
    date: r.date,
    incomeType: r.incomeTypeLine || r.incomeType,
    whtRate: r.whtRate,
    baseAmount: r.baseAmount,
    taxAmount: r.taxAmount,
    payeeKind: r.payeeKind,
  }));

  const pnd53Records = whtRecords.filter((r) => r.payeeKind !== "person");
  const pnd3Records = whtRecords.filter((r) => r.payeeKind === "person");
  const pnd3Base = pnd3Records.reduce((sum, r) => sum + r.baseAmount, 0);
  const pnd3Tax = pnd3Records.reduce((sum, r) => sum + r.taxAmount, 0);
  const pnd53Base = pnd53Records.reduce((sum, r) => sum + r.baseAmount, 0);
  const pnd53Tax = pnd53Records.reduce((sum, r) => sum + r.taxAmount, 0);
  const inputVat = mergeInputVat(
    initialWht.map((r) => ({
      date: r.date,
      vatAmount: Number(r.vatAmount || 0),
      direction: r.direction,
      source: "wht_certificate" as const,
    })),
    purchaseLines,
    selectedMonth
  );

  const paper = planTaxRecon({
    periodYm: selectedMonth,
    booksRevenue: initialBooksSales
      .filter((row) => (row.date || "").startsWith(selectedMonth))
      .reduce((sum, row) => sum + Number(row.total_revenue || 0), 0),
    booksCashIn:
      initialBooksSales
        .filter((row) => (row.date || "").startsWith(selectedMonth))
        .reduce((sum, row) => sum + Number(row.amount_paid || 0), 0) +
      initialBooksPayments
        .filter((row) => (row.sale_date || "").startsWith(selectedMonth))
        .reduce((sum, row) => sum + Number(row.amount || 0), 0),
    documents: [
      ...initialSalesDocs.map((d) => ({
        docType: d.doc_type,
        status: d.status,
        docNumber: d.doc_number,
        issueDate: d.issue_date,
        grandTotal: Number(d.grand_total || 0),
        vatAmount: Number(d.vat_amount || 0),
      })),
      ...initialCorrectionDocs.map((d) => ({
        docType: d.doc_type,
        status: d.status,
        docNumber: d.doc_number,
        issueDate: d.issue_date,
        grandTotal: Number(d.grand_total || 0),
        vatAmount: Number(d.vat_amount || 0),
      })),
    ],
    expenseVatIn: inputVat.vatIn,
    inputVatComplete: inputVat.completeBook,
    whtPayable: monthWht.reduce((sum, r) => sum + r.taxAmount, 0),
    periodClosed: isPeriodClosed(selectedMonth, closedPeriods),
  });

  const monthClosed = isPeriodClosed(selectedMonth, closedPeriods);
  const payerTaxId = digitsOnly(shopProfile?.taxId || "");

  function handleTogglePeriod() {
    if (!canClosePeriod) return;
    const closing = !monthClosed;
    const ok = window.confirm(
      closing
        ? `ปิดงวด ${selectedMonth}? หลังปิดจะแก้ยอดขาย รับชำระ และรายจ่ายของเดือนนี้ไม่ได้ — การปิดงวดไม่ได้ทำให้พร้อมยื่นภาษี`
        : `เปิดงวด ${selectedMonth} กลับมาให้แก้บัญชีร้านได้อีก`
    );
    if (!ok) return;
    startPeriodTransition(async () => {
      const res = closing ? await closePeriod(selectedMonth) : await reopenPeriod(selectedMonth);
      if (res.success) {
        setClosedPeriods(res.closed);
        toast.success(closing ? `ปิดงวด ${selectedMonth} แล้ว` : `เปิดงวด ${selectedMonth} แล้ว`);
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleAddPurchaseVat() {
    if (!canClosePeriod) return;
    startPurchaseTransition(async () => {
      const res = await addPurchaseVatLine({
        date: purchaseForm.date,
        vendorName: purchaseForm.vendorName,
        vendorTaxId: purchaseForm.vendorTaxId,
        invoiceNumber: purchaseForm.invoiceNumber,
        baseAmount: Number(purchaseForm.baseAmount || 0),
        vatAmount: Number(purchaseForm.vatAmount || 0),
      });
      if (res.success) {
        setPurchaseLines(res.lines);
        setPurchaseForm((prev) => ({ ...prev, vendorName: "", vendorTaxId: "", invoiceNumber: "", baseAmount: "", vatAmount: "" }));
        toast.success("บันทึกใบเสร็จซื้อแล้ว — ยังไม่ใช่สมุดซื้อเต็ม และยังไม่พร้อมยื่น");
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDeletePurchaseVat(id: string) {
    if (!canClosePeriod) return;
    startPurchaseTransition(async () => {
      const res = await deletePurchaseVatLine(id);
      if (res.success) {
        setPurchaseLines(res.lines);
        toast.success("ลบบรรทัดสมุดซื้อแล้ว");
      } else {
        toast.error(res.error);
      }
    });
  }

  function handleDownloadPndText(formType: "PND3" | "PND53") {
    const rows = formType === "PND3" ? pnd3Records : pnd53Records;
    if (rows.length === 0) {
      toast.error(
        formType === "PND3"
          ? "ไม่มีรายการบุคคลธรรมดาในงวดนี้ (ภ.ง.ด.3)"
          : "ไม่มีรายการนิติบุคคลในงวดนี้ (ภ.ง.ด.53)"
      );
      return;
    }
    if (payerTaxId.length !== 13) {
      toast.error("ตั้งเลขผู้เสียภาษี 13 หลักที่ /settings ก่อน จึงจะยื่น e-Filing ได้");
      return;
    }
    const file = generatePndEFilingFile(rows, {
      formType,
      payerTaxId,
      payerBranch: "000000",
      payerDeptName: shopProfile?.name || "สำนักงานใหญ่",
      periodYm: selectedMonth,
    });
    downloadTextFile(file.text, file.filename);
    for (const w of file.warnings) toast.warning(w);
    toast.success(`ดาวน์โหลด ${file.filename} แล้ว — อัปโหลดที่ efiling.rd.go.th (แบ่งข้อมูลด้วย |)`);
    void logTaxFilingExport({
      formType,
      filename: file.filename,
      periodYm: selectedMonth,
      recordCount: file.recordCount,
    });
  }

  function handleDownloadPp30Text() {
    if (vatRecords.length === 0) {
      toast.error("ไม่มีรายการภาษีขายในงวดเดือนนี้");
      return;
    }
    const text = generatePp30VatText(vatRecords);
    const filename = `PP30_VAT_SALES_${selectedMonth}.txt`;
    downloadTextFile(text, filename);
    toast.success("ดาวน์โหลดรายงานภาษีขายแล้ว — ภ.พ.30 บน e-Filing กรอกในเว็บ ไม่ใช่ไฟล์แนบแบบ ภ.ง.ด.");
    void logTaxFilingExport({
      formType: "PP30",
      filename,
      periodYm: selectedMonth,
      recordCount: vatRecords.length,
    });
  }

  const sampleETaxXml = generateETaxXML({
    docNumber: filteredSales[0]?.doc_number || "INV-20260830-0001",
    docTypeCode: "388",
    issueDate: new Date(),
    seller: {
      taxId: shopProfile?.taxId || "-",
      branchCode: "00000",
      name: shopProfile?.name || "ยังไม่ได้ตั้งค่าชื่อกิจการ",
      address: shopProfile?.address || "-",
    },
    buyer: {
      taxId: filteredSales[0]?.ext_contacts?.tax_id || "0505562000000",
      branchCode: filteredSales[0]?.ext_contacts?.branch_code || "00000",
      name: filteredSales[0]?.ext_contacts?.company_name || "ลูกค้าทั่วไป",
      address: filteredSales[0]?.ext_contacts?.address || "-",
    },
    items: [
      {
        name: "บริการซักทำความสะอาดรองเท้าพรีเมียม (Sneaker Deep Clean)",
        quantity: 1,
        unitPrice: totalSalesSubtotal || 650,
        lineTotal: totalSalesSubtotal || 650,
      },
    ],
    subtotal: totalSalesSubtotal || 650,
    vatAmount: totalSalesVat || 45.5,
    grandTotal: (totalSalesSubtotal || 650) + (totalSalesVat || 45.5),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="ภาษีและ e-Filing"
        description="กระดาษทำงานเทียบยอดขายร้านกับเอกสาร — ยังไม่พร้อมยื่น ภ.พ.30 / e-Tax"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
              <Calendar className="h-4 w-4 text-slate-500" />
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent font-medium text-slate-800 focus:outline-none dark:text-slate-100"
              />
            </label>
            {canClosePeriod && (
              <Button
                type="button"
                size="sm"
                variant={monthClosed ? "outline" : "default"}
                disabled={periodPending}
                onClick={handleTogglePeriod}
                className={
                  monthClosed
                    ? "h-9 gap-1.5 text-xs"
                    : "h-9 gap-1.5 bg-teal-700 text-xs text-white hover:bg-emerald-600"
                }
              >
                {monthClosed ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {periodPending ? "กำลังบันทึก…" : monthClosed ? "เปิดงวดนี้" : "ปิดงวดนี้"}
              </Button>
            )}
          </div>
        }
      />
      <UnderlineNav
        aria-label="เมนูภาษี"
        value={activeTab}
        onChange={(id) => setActiveTab(id as "efiling" | "tawi50" | "etax_xml")}
        items={[
          { id: "efiling", label: "ไฟล์ e-Filing", icon: FileSpreadsheet },
          { id: "tawi50", label: "หนังสือรับรอง 50 ทวิ", icon: FileCheck2 },
          { id: "etax_xml", label: "e-Tax XML", icon: Code2 },
        ]}
      />

      {/* ── TAB 1: E-FILING EXPORTS ── */}
      {activeTab === "efiling" && (
        <div className="space-y-4">
          <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-amber-950">กระดาษทำงานงวด {selectedMonth}</CardTitle>
              <CardDescription className="text-xs text-amber-900/80">
                {monthClosed
                  ? "งวดนี้ปิดแล้ว — ห้ามแก้บัญชีร้านของเดือนนี้ · ยังไม่พร้อมยื่น"
                  : "ยังไม่ปิดงวด · ยังไม่พร้อมยื่น — ใช้เทียบตัวเลขก่อนกรอกเว็บสรรพากร"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-amber-950">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex justify-between gap-4"><span>ยอดขายบัญชีร้าน</span><span className="font-mono">{paper.booksRevenue.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4"><span>เงินเข้าจริง</span><span className="font-mono">{paper.booksCashIn.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4"><span>สุทธิเอกสารขาย</span><span className="font-mono">{paper.documentNetSales.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4"><span>ส่วนต่างบัญชี vs เอกสาร</span><span className="font-mono">{paper.salesGap.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4"><span>ภาษีขายจากเอกสาร</span><span className="font-mono">{paper.vatOut.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4"><span>ภาษีซื้อรวม (ยังไม่ครบ)</span><span className="font-mono">{paper.vatIn.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4 text-amber-900/80"><span>จากใบหัก ณ ที่จ่าย</span><span className="font-mono">{inputVat.whtVatIn.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4 text-amber-900/80"><span>จากใบเสร็จที่กรอกเอง</span><span className="font-mono">{inputVat.purchaseVatIn.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4"><span>หัก ณ ที่จ่ายที่ต้องนำส่ง</span><span className="font-mono">{paper.whtPayable.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between gap-4"><span>สถานะงวด</span><span className="font-medium">{monthClosed ? "ปิดแล้ว" : "ยังไม่ปิด"}</span></div>
              </div>
              <ul className="list-disc space-y-0.5 pl-4 text-amber-900/90">
                {paper.blockers.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">สมุดภาษีซื้อจากใบเสร็จที่กรอกเอง</CardTitle>
              <CardDescription className="text-xs">
                กรอกจากใบกำกับภาษีซื้อจริงเท่านั้น — ไม่ดึง OCR จำลอง · ยังไม่ใช่สมุดซื้อเต็ม · ปิดงวดแล้วห้ามแก้
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {canClosePeriod && !monthClosed && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-slate-500">วันที่ใบเสร็จ</span>
                    <input
                      type="date"
                      value={purchaseForm.date}
                      onChange={(e) => setPurchaseForm((p) => ({ ...p, date: e.target.value }))}
                      className="h-8 w-full rounded-md border px-2"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-500">เลขที่ใบเสร็จ</span>
                    <input
                      value={purchaseForm.invoiceNumber}
                      onChange={(e) => setPurchaseForm((p) => ({ ...p, invoiceNumber: e.target.value }))}
                      className="h-8 w-full rounded-md border px-2"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-500">ชื่อผู้ขาย</span>
                    <input
                      value={purchaseForm.vendorName}
                      onChange={(e) => setPurchaseForm((p) => ({ ...p, vendorName: e.target.value }))}
                      className="h-8 w-full rounded-md border px-2"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-500">เลขผู้เสียภาษี 13 หลัก (ถ้ามี)</span>
                    <input
                      value={purchaseForm.vendorTaxId}
                      onChange={(e) => setPurchaseForm((p) => ({ ...p, vendorTaxId: e.target.value }))}
                      className="h-8 w-full rounded-md border px-2 font-mono"
                      inputMode="numeric"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-500">ฐานภาษี</span>
                    <input
                      value={purchaseForm.baseAmount}
                      onChange={(e) => setPurchaseForm((p) => ({ ...p, baseAmount: e.target.value }))}
                      className="h-8 w-full rounded-md border px-2 font-mono"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-slate-500">ภาษีมูลค่าเพิ่ม</span>
                    <input
                      value={purchaseForm.vatAmount}
                      onChange={(e) => setPurchaseForm((p) => ({ ...p, vatAmount: e.target.value }))}
                      className="h-8 w-full rounded-md border px-2 font-mono"
                      inputMode="decimal"
                    />
                  </label>
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={purchasePending}
                      onClick={handleAddPurchaseVat}
                      className="h-8 bg-teal-700 text-xs text-white hover:bg-emerald-600"
                    >
                      {purchasePending ? "กำลังบันทึก…" : "เพิ่มใบเสร็จซื้อ"}
                    </Button>
                  </div>
                </div>
              )}
              <table className="w-full text-left">
                <thead className="border-b text-slate-500">
                  <tr>
                    <th className="py-1.5 font-medium">วันที่</th>
                    <th className="py-1.5 font-medium">ผู้ขาย</th>
                    <th className="py-1.5 text-right font-medium">VAT</th>
                    {canClosePeriod && !monthClosed && <th className="py-1.5" />}
                  </tr>
                </thead>
                <tbody>
                  {purchaseLines.filter((line) => line.date.startsWith(selectedMonth)).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-3 text-slate-400">
                        ยังไม่มีใบเสร็จซื้อในงวดนี้
                      </td>
                    </tr>
                  ) : (
                    purchaseLines
                      .filter((line) => line.date.startsWith(selectedMonth))
                      .map((line) => (
                        <tr key={line.id} className="border-b border-slate-100">
                          <td className="py-1.5 font-mono">{line.date}</td>
                          <td className="py-1.5">
                            {line.vendorName}
                            {line.invoiceNumber ? ` · ${line.invoiceNumber}` : ""}
                          </td>
                          <td className="py-1.5 text-right font-mono">
                            {line.vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </td>
                          {canClosePeriod && !monthClosed && (
                            <td className="py-1.5 text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={purchasePending}
                                onClick={() => handleDeletePurchaseVat(line.id)}
                                className="h-7 text-[11px]"
                              >
                                ลบ
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 space-y-1">
            <p>
              ไฟล์ ภ.ง.ด.3 / ภ.ง.ด.53 สร้างตาม FORMAT กลาง กรมสรรพากร V2 (UTF-8, คั่นด้วย |, มีแถว Header H + Detail D)
              สำหรับอัปโหลดที่{" "}
              <a
                href="https://efiling.rd.go.th/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-800 underline"
              >
                efiling.rd.go.th
              </a>{" "}
              — เลือกแบบ ภ.ง.ด. แล้วอัปโหลดไฟล์ โดยเลือกรูปแบบแบ่งข้อมูลด้วยสัญลักษณ์ |
            </p>
            <p>
              เลขผู้เสียภาษีผู้มีหน้าที่หัก:{" "}
              <span className="font-mono font-semibold text-slate-800">
                {payerTaxId.length === 13 ? payerTaxId : "ยังไม่ได้ตั้ง 13 หลักที่ /settings"}
              </span>
              {whtRecords.some((r) => digitsOnly(r.taxId).length !== 13) && (
                <span className="block text-amber-800 mt-1">
                  บางรายการยังไม่มีเลขผู้เสียภาษี 13 หลักของผู้รับเงิน — e-Filing จะปฏิเสธแถวนั้น
                  ให้กรอกตอนบันทึกหัก ณ ที่จ่ายที่หน้า /expenses
                </span>
              )}
            </p>
          </div>
        <div className="grid gap-6 sm:grid-cols-3">
          <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>ภาษีมูลค่าเพิ่ม (ภ.พ.30)</span>
                <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200">PP.30</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                รายงานภาษีขายสำหรับอ้างอิง — ภ.พ.30 ยื่นโดยกรอกในเว็บ e-Filing ไม่ใช่ไฟล์แนบ | แบบ ภ.ง.ด.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>ยอดขายฐานภาษี:</span>
                  <span className="font-mono font-bold">฿{totalSalesSubtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีขาย (VAT 7%):</span>
                  <span className="font-mono font-bold text-teal-700">฿{totalSalesVat.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <Button
                onClick={handleDownloadPp30Text}
                className="w-full bg-teal-700 hover:bg-emerald-600 text-white text-xs font-semibold h-9 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> ดาวน์โหลดรายงานภาษีขาย (.txt)
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>หัก ณ ที่จ่าย นิติบุคคล (ภ.ง.ด.53)</span>
                <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200">PND53</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                รายการหักภาษี ณ ที่จ่ายนิติบุคคล {pnd53Records.length} รายการ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>ยอดจ่ายค่าบริการรวม:</span>
                  <span className="font-mono font-bold">฿{pnd53Base.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีหักนำส่งรวม:</span>
                  <span className="font-mono font-bold text-teal-700">฿{pnd53Tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <Button
                onClick={() => handleDownloadPndText("PND53")}
                className="w-full bg-teal-700 hover:bg-emerald-600 text-white text-xs font-semibold h-9 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> ดาวน์โหลดไฟล์ ภ.ง.ด.53 (.txt)
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>หัก ณ ที่จ่าย บุคคลธรรมดา (ภ.ง.ด.3)</span>
                <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200">PND3</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                รายการหักภาษี ณ ที่จ่ายบุคคลธรรมดา {pnd3Records.length} รายการ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>ยอดจ่ายบุคคลรวม:</span>
                  <span className="font-mono font-bold">฿{pnd3Base.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีหักนำส่งรวม:</span>
                  <span className="font-mono font-bold text-teal-700">฿{pnd3Tax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <Button
                onClick={() => handleDownloadPndText("PND3")}
                variant="outline"
                className="w-full text-xs font-semibold h-9 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> ดาวน์โหลดไฟล์ ภ.ง.ด.3 (.txt)
              </Button>
            </CardContent>
          </Card>
        </div>
        {receivableMonth.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
            รายได้อื่น (ค่าเช่าห้อง) ที่ผู้เช่าหักภาษีไว้ {receivableMonth.length} รายการ
            รวมถูกหัก ฿{receivableWithheld.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            — ไม่รวมในไฟล์ ภ.ง.ด.3/53 เพราะร้านเป็นผู้ถูกหัก ไม่ใช่ผู้หัก
          </div>
        )}
        </div>
      )}

      {/* ── TAB 2: 50 TAWI CERTIFICATES ── */}
      {activeTab === "tawi50" && (
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold">
                หนังสือรับรองการหักภาษี ณ ที่จ่าย (ตามมาตรา 50 ทวิ)
              </CardTitle>
              <CardDescription className="text-xs">
                ออกเอกสาร 50 ทวิ ให้กับผู้รับเงิน/คู่ค้าในงวดเดือน {selectedMonth}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="px-4 py-3">ลำดับ</th>
                    <th className="px-4 py-3">ผู้ถูกหักภาษี</th>
                    <th className="px-4 py-3">ประเภทเงินได้</th>
                    <th className="px-4 py-3 text-right">จำนวนเงินที่จ่าย</th>
                    <th className="px-4 py-3 text-center">อัตรา</th>
                    <th className="px-4 py-3 text-right">ภาษีที่หักและนำส่ง</th>
                    <th className="px-4 py-3 text-center">การพิมพ์</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {monthWht.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        ยังไม่มีหนังสือรับรองหัก ณ ที่จ่ายในงวดนี้ — บันทึกตอนจ่ายที่ /expenses แล้วระบบจะออก 50 ทวิ ให้
                      </td>
                    </tr>
                  ) : (
                    monthWht.map((r, index) => (
                      <tr key={r.certificateNumber || index} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-center">{index + 1}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{r.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {r.certificateNumber} · Tax ID: {r.taxId}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{r.incomeTypeLine || r.incomeType}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {formatTawi50Amount(r.baseAmount)}
                        </td>
                        <td className="px-4 py-3 text-center font-mono">{r.whtRate}%</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-teal-800">
                          {formatTawi50Amount(r.taxAmount)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            onClick={() => {
                              setTawiCondition(DEFAULT_TAWI50_CONDITION);
                              setTawiOtherNote("");
                              setTawiCopyNo(1);
                              setSelectedWhtCert({ ...r, sequence: index + 1 });
                            }}
                            variant="outline"
                            className="h-7 text-[11px] gap-1 text-teal-800 hover:bg-teal-50 border-teal-200 font-bold"
                          >
                            <Printer className="h-3 w-3" /> พิมพ์ 50 ทวิ (A4)
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 3: ETDA XML VIEWER ── */}
      {activeTab === "etax_xml" && (
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Code2 className="h-4 w-4 text-teal-700" />
                โครงสร้างข้อมูล XML ตามมาตรฐาน ETDA (ขมธอ. 3-2560)
              </CardTitle>
              <CardDescription className="text-xs">
                UN/CEFACT Tax Invoice Cross Industry Invoice XML Schema
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => {
                const filename = `etax_${selectedMonth}.xml`;
                downloadTextFile(sampleETaxXml, filename, "application/xml");
                toast.success("ดาวน์โหลดไฟล์ ETDA XML เรียบร้อย");
                void logTaxFilingExport({
                  formType: "ETAX_XML",
                  filename,
                  periodYm: selectedMonth,
                  recordCount: filteredSales.length,
                });
              }}
              className="bg-teal-700 hover:bg-emerald-600 text-white text-xs h-8 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> ดาวน์โหลด XML
            </Button>
          </CardHeader>
          <CardContent className="p-4">
            <pre className="p-4 rounded-xl bg-slate-900 text-teal-300 text-[11px] font-mono overflow-x-auto max-h-96">
              {sampleETaxXml}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* ── OFFICIAL 50 TAWI PRINT MODAL (A4 ISOLATION) ── */}
      {selectedWhtCert && (
        <PrintModalPortal>
        <ModalBackdrop
          onClose={() => setSelectedWhtCert(null)}
          className="bg-black/60 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-300 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <Landmark className="h-5 w-5 text-teal-700" />
                <span className="text-sm font-bold text-slate-900">
                  หนังสือรับรองการหักภาษี ณ ที่จ่าย (ตามมาตรา 50 ทวิ)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-teal-700 hover:bg-emerald-600 text-white font-semibold text-xs gap-1.5"
                >
                  <Printer className="h-4 w-4" /> พิมพ์เอกสาร A4
                </Button>
                <button
                  onClick={() => setSelectedWhtCert(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="print:hidden space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-[11px]">
              <div className="font-semibold text-slate-700">ฉบับที่พิมพ์</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                <label className="flex items-center gap-1.5 text-slate-700">
                  <input type="radio" checked={tawiCopyNo === 1} onChange={() => setTawiCopyNo(1)} />
                  ฉบับที่ 1 (ให้ผู้ถูกหัก — แนบแบบแสดงรายการ)
                </label>
                <label className="flex items-center gap-1.5 text-slate-700">
                  <input type="radio" checked={tawiCopyNo === 2} onChange={() => setTawiCopyNo(2)} />
                  ฉบับที่ 2 (เก็บเป็นหลักฐานผู้หัก)
                </label>
              </div>
              <div className="font-semibold text-slate-700 pt-1">เงื่อนไขการหักภาษีที่พิมพ์บนเอกสาร</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {TAWI50_CONDITIONS.map((item) => (
                  <label key={item.id} className="flex items-center gap-1.5 text-slate-700">
                    <input
                      type="radio"
                      name="tawi-condition"
                      checked={tawiCondition === item.id}
                      onChange={() => setTawiCondition(item.id)}
                    />
                    {item.label}
                  </label>
                ))}
              </div>
              {tawiCondition === "4" && (
                <input
                  value={tawiOtherNote}
                  onChange={(e) => setTawiOtherNote(e.target.value)}
                  placeholder="ระบุเงื่อนไขอื่น"
                  className="h-8 w-full rounded-md border px-2 text-xs"
                />
              )}
              <p className="text-slate-500">
                ค่าเริ่มต้นคือ (1) หักภาษี ณ ที่จ่าย · ลายเซ็นและตราประทับดึงจาก /settings เมื่อมี URL
              </p>
            </div>

            <Tawi50Certificate
              cert={{
                certificateNumber:
                  selectedWhtCert.certificateNumber ||
                  `WHT-${selectedMonth.replace("-", "")}-${String(selectedWhtCert.sequence).padStart(4, "0")}`,
                paymentDate: selectedWhtCert.date,
                incomeType: selectedWhtCert.incomeType,
                incomeTypeCode: selectedWhtCert.incomeTypeCode,
                baseAmount: selectedWhtCert.baseAmount,
                taxAmount: selectedWhtCert.taxAmount,
                whtRate: selectedWhtCert.whtRate,
                payeeName: selectedWhtCert.name,
                payeeTaxId: selectedWhtCert.taxId,
                payeeAddress: selectedWhtCert.address,
                payeeKind: selectedWhtCert.payeeKind,
              }}
              payer={{
                name: shopProfile?.name || "ยังไม่ได้ตั้งค่าชื่อกิจการ — ไปที่ /settings",
                taxId: shopProfile?.taxId || "-",
                address: shopProfile?.address || "-",
                signatoryName: shopProfile?.signatoryName,
                signatureUrl: shopProfile?.signatureUrl,
                stampUrl: shopProfile?.stampUrl,
              }}
              condition={tawiCondition}
              otherNote={tawiOtherNote}
              copyNo={tawiCopyNo}
            />
          </div>
        </ModalBackdrop>
        </PrintModalPortal>
      )}
    </div>
  );
}
