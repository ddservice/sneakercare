"use client";

import { useState } from "react";
import {
  generatePndEFilingText,
  generatePp30VatText,
  type WhtRecord,
  type VatTransaction,
} from "@/lib/smartacc/tax-reports";
import { generateETaxXML } from "@/lib/smartacc/etax-generator";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Landmark,
  FileSpreadsheet,
  Download,
  Code2,
  FileCheck2,
  Calendar,
  Printer,
} from "lucide-react";

export function TaxFilingClient({
  initialSalesDocs,
  initialExpenses,
}: {
  initialSalesDocs: any[];
  initialExpenses: any[];
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [activeTab, setActiveTab] = useState<"efiling" | "tawi50" | "etax_xml">("efiling");

  // Calculate real VAT and WHT from database records
  const filteredSales = initialSalesDocs.filter((d) =>
    (d.issue_date || "").startsWith(selectedMonth)
  );
  const filteredExpenses = initialExpenses.filter((e) =>
    (e.expense_date || "").startsWith(selectedMonth)
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

  const whtRecords: WhtRecord[] = filteredExpenses
    .filter((e) => Number(e.amount || 0) >= 1000)
    .map((e, index) => {
      const base = Number(e.amount || 0);
      const rate = 3.0;
      const tax = base * (rate / 100);
      return {
        sequence: index + 1,
        taxId: "0105558000000",
        name: e.title || "ผู้รับเงิน",
        address: "เชียงใหม่",
        date: e.expense_date,
        incomeType: e.category || "ค่าบริการ",
        whtRate: rate,
        baseAmount: base,
        taxAmount: tax,
      };
    });

  const totalWhtBase = whtRecords.reduce((sum, r) => sum + r.baseAmount, 0);
  const totalWhtTax = whtRecords.reduce((sum, r) => sum + r.taxAmount, 0);

  function handleDownloadPndText(formType: "PND3" | "PND53") {
    if (whtRecords.length === 0) {
      toast.error("ไม่มีรายการหัก ณ ที่จ่ายในงวดเดือนนี้");
      return;
    }
    const text = generatePndEFilingText(whtRecords, formType);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${formType}_${selectedMonth}.txt`;
    a.click();
    toast.success(`ดาวน์โหลดไฟล์ ${formType} e-Filing (.txt) เรียบร้อย`);
  }

  function handleDownloadPp30Text() {
    if (vatRecords.length === 0) {
      toast.error("ไม่มีรายการภาษีขายในงวดเดือนนี้");
      return;
    }
    const text = generatePp30VatText(vatRecords);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PP30_${selectedMonth}.txt`;
    a.click();
    toast.success("ดาวน์โหลดไฟล์ ภ.พ.30 e-Filing (.txt) เรียบร้อย");
  }

  const sampleETaxXml = generateETaxXML({
    docNumber: filteredSales[0]?.doc_number || "INV-20260830-0001",
    docTypeCode: "388",
    issueDate: new Date(),
    seller: {
      taxId: "0105558000000",
      branchCode: "00000",
      name: "บริษัท สนีกเกอร์ แคร์ อินเตอร์เนชั่นแนล จำกัด",
      address: "123/45 ถนนสุขุมวิท กรุงเทพมหานคร",
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
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
            <Landmark className="h-3.5 w-3.5" />
            Revenue Department & ETDA Standard Suite
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            ศูนย์บริหารจัดการภาษี & e-Tax Invoice
          </h2>
          <p className="text-xs text-slate-500">
            ข้อมูลภาษีคำนวณสดจากบิลขาย ({initialSalesDocs.length} ฉบับ) และรายการค่าใช้จ่ายจริงในระบบ
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1.5">
          <Calendar className="h-4 w-4 text-slate-500 ml-1" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none pr-1"
          />
        </div>
      </div>

      {/* ── Sub Navigation ── */}
      <div className="flex gap-2 border-b border-slate-200 pb-2">
        <button
          onClick={() => setActiveTab("efiling")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "efiling"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FileSpreadsheet className="h-4 w-4" /> ส่งออกไฟล์ e-Filing (ภ.พ.30, ภ.ง.ด.53)
        </button>
        <button
          onClick={() => setActiveTab("tawi50")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "tawi50"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <FileCheck2 className="h-4 w-4" /> หนังสือรับรอง 50 ทวิ (WHT Certificate)
        </button>
        <button
          onClick={() => setActiveTab("etax_xml")}
          className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "etax_xml"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <Code2 className="h-4 w-4" /> โครงสร้าง ETDA e-Tax XML (ขมธอ. 3-2560)
        </button>
      </div>

      {/* ── TAB 1: E-FILING EXPORTS ── */}
      {activeTab === "efiling" && (
        <div className="grid gap-6 sm:grid-cols-3">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>ภาษีมูลค่าเพิ่ม (ภ.พ.30)</span>
                <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200">PP.30</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                รายงานภาษีขาย ประจำงวดเดือน {selectedMonth} ({filteredSales.length} รายการ)
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
                disabled={vatRecords.length === 0}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold h-9 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> ดาวน์โหลดไฟล์ ภ.พ.30 (.txt)
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>หัก ณ ที่จ่าย นิติบุคคล (ภ.ง.ด.53)</span>
                <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200">PND53</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                รายการหักภาษี ณ ที่จ่าย {whtRecords.length} รายการ
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>ยอดจ่ายค่าบริการรวม:</span>
                  <span className="font-mono font-bold">฿{totalWhtBase.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีหักนำส่งรวม:</span>
                  <span className="font-mono font-bold text-teal-700">฿{totalWhtTax.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <Button
                onClick={() => handleDownloadPndText("PND53")}
                disabled={whtRecords.length === 0}
                className="w-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold h-9 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> ดาวน์โหลดไฟล์ ภ.ง.ด.53 (.txt)
              </Button>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>หัก ณ ที่จ่าย บุคคลธรรมดา (ภ.ง.ด.3)</span>
                <Badge variant="outline" className="text-teal-800 bg-teal-50 border-teal-200">PND3</Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                รายการหักภาษี ณ ที่จ่าย บุคคลธรรมดา
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-1">
              <div className="text-xs space-y-1 text-slate-600">
                <div className="flex justify-between">
                  <span>ยอดจ่ายบุคคลรวม:</span>
                  <span className="font-mono font-bold">฿0.00</span>
                </div>
                <div className="flex justify-between">
                  <span>ภาษีหักนำส่งรวม:</span>
                  <span className="font-mono font-bold text-teal-700">฿0.00</span>
                </div>
              </div>
              <Button
                onClick={() => handleDownloadPndText("PND3")}
                variant="outline"
                disabled
                className="w-full text-xs font-semibold h-9 gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> ดาวน์โหลดไฟล์ ภ.ง.ด.3 (.txt)
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TAB 2: 50 TAWI CERTIFICATES ── */}
      {activeTab === "tawi50" && (
        <Card className="border-slate-200 shadow-xs">
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
                  {whtRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        ไม่มีรายการจ่ายที่เข้าเกณฑ์หักภาษี ณ ที่จ่ายในงวดเดือนนี้
                      </td>
                    </tr>
                  ) : (
                    whtRecords.map((r) => (
                      <tr key={r.sequence} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-center">{r.sequence}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{r.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">Tax ID: {r.taxId}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{r.incomeType}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          ฿{r.baseAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center font-mono">{r.whtRate}%</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-teal-800">
                          ฿{r.taxAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            size="sm"
                            onClick={() => window.print()}
                            variant="outline"
                            className="h-7 text-[11px] gap-1"
                          >
                            <Printer className="h-3 w-3" /> พิมพ์ 50 ทวิ
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
        <Card className="border-slate-200 shadow-xs">
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
                const blob = new Blob([sampleETaxXml], { type: "application/xml" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `etax_${selectedMonth}.xml`;
                a.click();
                toast.success("ดาวน์โหลดไฟล์ ETDA XML เรียบร้อย");
              }}
              className="bg-teal-700 hover:bg-teal-800 text-white text-xs h-8 gap-1.5"
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
    </div>
  );
}
