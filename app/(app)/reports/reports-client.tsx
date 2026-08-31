"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  bulkImportSales,
  bulkImportStock,
  bulkImportExpenses,
} from "@/app/actions/import-export";
import {
  FileSpreadsheet,
  Download,
  Upload,
  Database,
  Receipt,
  Boxes,
  Wallet,
  Users,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  FileUp,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";

export function ReportsClient({
  salesData,
  stockData,
  expensesData,
  cogsData,
}: {
  salesData: any[];
  stockData: any[];
  expensesData: any[];
  cogsData: { rows: any[]; total: number; range: { from: string; to: string } };
}) {
  const [activeTab, setActiveTab] = useState<"export" | "import" | "cogs">("export");
  const [isPending, startTransition] = useTransition();

  // Import State
  const [importType, setImportType] = useState<"sales" | "stock" | "expenses">("sales");
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [rawImportData, setRawImportData] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState("");

  // ── EXPORT HANDLERS ──────────────────────────────────────────
  function exportSales() {
    const data = salesData.map((s, idx) => ({
      ลำดับ: idx + 1,
      วันที่: s.date,
      "Size S (200฿)": s.size_s || 0,
      "Size M (400฿)": s.size_m || 0,
      "Size L (600฿)": s.size_l || 0,
      "Size XL (800฿)": s.size_xl || 0,
      บริการเสริม: s.extra_items || "—",
      ยอดก่อนลด: s.grand_total || s.total_revenue || 0,
      ส่วนลด: s.discount || 0,
      ยอดสุทธิ: s.total_revenue || 0,
      ยอดเงินโอน: s.transfer_amount || 0,
      ยอดเงินสด: s.cash_amount || 0,
      ยอดรับชำระจริง: (s.transfer_amount || 0) + (s.cash_amount || 0),
      สถานะชำระ: s.payment_status || "ชำระครบ",
      ผู้บันทึก: s.recorded_by || "Staff",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "DailySales");
    XLSX.writeFile(wb, `SneakerCare_Sales_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("ส่งออกข้อมูลยอดขายเรียบร้อย");
  }

  function exportStock() {
    const data = stockData.map((item, idx) => ({
      ลำดับ: idx + 1,
      รายการวัสดุ: item.name,
      หมวดหมู่: item.category || "ทั่วไป",
      หน่วยนับ: item.base_unit || "ชิ้น",
      คงเหลือจริง: item.current_qty || 0,
      เกณฑ์ขั้นต่ำ: item.min_stock_level || 1,
      ต้นทุนต่อหน่วย: item.avg_unit_cost || 0,
      มูลค่ารวม: (item.current_qty || 0) * (item.avg_unit_cost || 0),
      สถานะ: (item.current_qty || 0) <= (item.min_stock_level || 1) ? "ใกล้หมด" : "ปกติ",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    XLSX.writeFile(wb, `SneakerCare_Stock_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("ส่งออกข้อมูลคลังสินค้าเรียบร้อย");
  }

  function exportExpenses() {
    const data = expensesData.map((e, idx) => ({
      ลำดับ: idx + 1,
      วันที่: e.date,
      หมวดหมู่: e.category || "ทั่วไป",
      รายการ: e.item_name,
      จำนวนเงิน: e.total_amount || 0,
      ช่องทางชำระ: e.pay_method || "เงินสด",
      ผู้บันทึก: e.recorded_by || "Staff",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expenses");
    XLSX.writeFile(wb, `SneakerCare_Expenses_Export_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("ส่งออกข้อมูลรายจ่ายเรียบร้อย");
  }

  // ── TEMPLATE DOWNLOAD ─────────────────────────────────────────
  function downloadTemplate(type: "sales" | "stock" | "expenses") {
    let headers: any[][] = [];
    let fileName = "";

    if (type === "sales") {
      headers = [
        ["วันที่", "Size S", "Size M", "Size L", "Size XL", "ยอดสุทธิ", "ยอดเงินโอน", "ยอดเงินสด", "ส่วนลด"],
        ["2026-08-31", 5, 2, 1, 0, 2400, 2000, 400, 0],
      ];
      fileName = "SneakerCare_Sales_Template.xlsx";
    } else if (type === "stock") {
      headers = [
        ["รายการวัสดุ", "หมวดหมู่", "หน่วย", "คงเหลือ", "ราคาต้นทุน", "จุดสั่งซื้อขั้นต่ำ"],
        ["น้ำยาทำความสะอาดขวดใหญ่", "น้ำยาซัก", "ขวด", 20, 150, 5],
      ];
      fileName = "SneakerCare_Stock_Template.xlsx";
    } else {
      headers = [
        ["วันที่", "หมวดหมู่", "รายการ", "จำนวนเงิน", "ช่องทางชำระ"],
        ["2026-08-31", "น้ำยา/เคมี", "ซื้อแปรงขัดพิเศษ", 350, "เงินสด"],
      ];
      fileName = "SneakerCare_Expenses_Template.xlsx";
    }

    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, fileName);
    toast.success(`ดาวน์โหลดแม่แบบ ${fileName} เรียบร้อย`);
  }

  // ── IMPORT HANDLERS ───────────────────────────────────────────
  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];

        const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (!rows || rows.length < 2) {
          toast.error("ไฟล์ไม่มีข้อมูลหรือรูปแบบไม่ถูกต้อง");
          return;
        }

        const headers = rows[0].map(String);
        const dataRows = XLSX.utils.sheet_to_json(sheet);

        setImportHeaders(headers);
        setPreviewRows(dataRows.slice(0, 5));
        setRawImportData(dataRows);
        toast.info(`ตรวจพบข้อมูลทั้งหมด ${dataRows.length} แถว พร้อมนำเข้า`);
      } catch (err: any) {
        toast.error("ไม่สามารถอ่านไฟล์ได้: " + err.message);
      }
    };

    reader.readAsArrayBuffer(file);
  }

  function handleExecuteImport() {
    if (rawImportData.length === 0) {
      toast.error("กรุณาเลือกไฟล์ที่มีข้อมูล");
      return;
    }

    startTransition(async () => {
      let res;
      if (importType === "sales") {
        res = await bulkImportSales(rawImportData);
      } else if (importType === "stock") {
        res = await bulkImportStock(rawImportData);
      } else {
        res = await bulkImportExpenses(rawImportData);
      }

      if (res.success) {
        toast.success(`นำเข้าข้อมูลสำเร็จ ${res.imported} รายการ (ล้มเหลว ${res.failed})`);
        setPreviewRows([]);
        setRawImportData([]);
        setImportFileName("");
      } else {
        toast.error(`เกิดข้อผิดพลาด: ${res.errors.join(", ")}`);
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Database className="h-3.5 w-3.5" />
            Central Data Management Hub
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ศูนย์จัดการข้อมูล นำเข้า / ส่งออก (Import & Export)</h2>
          <p className="text-xs sm:text-sm text-teal-100/80">
            ส่งออกไฟล์ Excel/CSV ทุกโมดูล นำเข้าข้อมูลแบบกลุ่มด้วยเทมเพลตมาตรฐาน และรายงานบัญชีต้นทุน COGS
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-xl border border-white/20">
          <Button
            size="sm"
            variant={activeTab === "export" ? "default" : "ghost"}
            onClick={() => setActiveTab("export")}
            className={`text-xs h-8 font-bold ${
              activeTab === "export" ? "bg-white text-teal-950 hover:bg-slate-100" : "text-white hover:bg-white/10"
            }`}
          >
            <Download className="h-3.5 w-3.5 mr-1" /> ส่งออก (Export)
          </Button>
          <Button
            size="sm"
            variant={activeTab === "import" ? "default" : "ghost"}
            onClick={() => setActiveTab("import")}
            className={`text-xs h-8 font-bold ${
              activeTab === "import" ? "bg-white text-teal-950 hover:bg-slate-100" : "text-white hover:bg-white/10"
            }`}
          >
            <Upload className="h-3.5 w-3.5 mr-1" /> นำเข้า (Import)
          </Button>
          <Button
            size="sm"
            variant={activeTab === "cogs" ? "default" : "ghost"}
            onClick={() => setActiveTab("cogs")}
            className={`text-xs h-8 font-bold ${
              activeTab === "cogs" ? "bg-white text-teal-950 hover:bg-slate-100" : "text-white hover:bg-white/10"
            }`}
          >
            <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> รายงาน COGS
          </Button>
        </div>
      </div>

      {/* ── TAB 1: EXPORT HUB ── */}
      {activeTab === "export" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* 1. Sales Export */}
            <Card className="border-teal-200 shadow-xs hover:border-teal-400 transition-all">
              <CardHeader className="p-4 bg-teal-50/50 border-b border-teal-100">
                <div className="flex items-center justify-between">
                  <Receipt className="h-6 w-6 text-teal-700" />
                  <Badge variant="outline" className="bg-teal-100 text-teal-900 border-teal-300 text-[10px]">
                    {salesData.length} รายการ
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold text-slate-900 pt-2">ข้อมูลยอดขายรายวัน</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  สถิติจำนวนคู่ S/M/L/XL, เงินโอน, เงินสด, ส่วนลด
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-3">
                <Button
                  onClick={exportSales}
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-8.5 gap-1.5 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" /> ดาวน์โหลด Excel (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* 2. Stock Export */}
            <Card className="border-slate-200 shadow-xs hover:border-slate-400 transition-all">
              <CardHeader className="p-4 bg-slate-50 border-b border-slate-100">
                <div className="flex items-center justify-between">
                  <Boxes className="h-6 w-6 text-slate-700" />
                  <Badge variant="outline" className="bg-slate-100 text-slate-800 border-slate-300 text-[10px]">
                    {stockData.length} รายการ
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold text-slate-900 pt-2">คลังสินค้า & สต๊อกน้ำยา</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  ยอดคงเหลือ, หน่วยนับ, ต้นทุนถัวเฉลี่ย, จุดสั่งซื้อ
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-3">
                <Button
                  onClick={exportStock}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs h-8.5 gap-1.5 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" /> ดาวน์โหลด Excel (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* 3. Expenses Export */}
            <Card className="border-amber-200 shadow-xs hover:border-amber-400 transition-all">
              <CardHeader className="p-4 bg-amber-50/50 border-b border-amber-100">
                <div className="flex items-center justify-between">
                  <Wallet className="h-6 w-6 text-amber-700" />
                  <Badge variant="outline" className="bg-amber-100 text-amber-900 border-amber-300 text-[10px]">
                    {expensesData.length} รายการ
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold text-slate-900 pt-2">บันทึกค่าใช้จ่าย & OPEX</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  ค่าใช้จ่ายหน้าร้าน, ค่าดำเนินงาน, หมวดหมู่, ช่องทางชำระ
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-3">
                <Button
                  onClick={exportExpenses}
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-8.5 gap-1.5 shadow-xs"
                >
                  <Download className="h-3.5 w-3.5" /> ดาวน์โหลด Excel (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* 4. Staff & Roster Export */}
            <Card className="border-indigo-200 shadow-xs hover:border-indigo-400 transition-all">
              <CardHeader className="p-4 bg-indigo-50/50 border-b border-indigo-100">
                <div className="flex items-center justify-between">
                  <Users className="h-6 w-6 text-indigo-700" />
                  <Badge variant="outline" className="bg-indigo-100 text-indigo-900 border-indigo-300 text-[10px]">
                    3 พนักงาน
                  </Badge>
                </div>
                <CardTitle className="text-sm font-bold text-slate-900 pt-2">ตารางเวร & เงินเดือน</CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  ตารางกะรายวัน, วันหยุดแรงงาน, เงินเดือน/ค่าแรงรายวัน
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-3">
                <Link href="/roster">
                  <Button className="w-full bg-indigo-700 hover:bg-indigo-800 text-white font-bold text-xs h-8.5 gap-1.5 shadow-xs">
                    <ArrowRight className="h-3.5 w-3.5" /> ไปที่หน้า Roster & Export
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB 2: IMPORT HUB ── */}
      {activeTab === "import" && (
        <div className="grid gap-6 lg:grid-cols-12">
          {/* Left: Template Download & Select Type (4 Cols) */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="p-4 bg-slate-50 border-b border-slate-100">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <FileDown className="h-4 w-4 text-teal-700" /> ดาวน์โหลดเทมเพลต (Templates)
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  ดาวน์โหลดไฟล์ตัวอย่างมาตรฐานไปกรอกก่อนนำเข้า
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate("sales")}
                  className="w-full justify-start text-xs h-9 gap-2 border-teal-200 text-teal-900 hover:bg-teal-50 font-semibold"
                >
                  <Receipt className="h-4 w-4 text-teal-700" /> เทมเพลตยอดขาย (.xlsx)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate("stock")}
                  className="w-full justify-start text-xs h-9 gap-2 border-slate-200 text-slate-900 hover:bg-slate-50 font-semibold"
                >
                  <Boxes className="h-4 w-4 text-slate-700" /> เทมเพลตคลังสินค้า (.xlsx)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadTemplate("expenses")}
                  className="w-full justify-start text-xs h-9 gap-2 border-amber-200 text-amber-900 hover:bg-amber-50 font-semibold"
                >
                  <Wallet className="h-4 w-4 text-amber-700" /> เทมเพลตรายจ่าย (.xlsx)
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Right: Upload & Preview (8 Cols) */}
          <div className="lg:col-span-8 space-y-4">
            <Card className="border-teal-200 shadow-sm">
              <CardHeader className="p-4 bg-teal-50/60 border-b border-teal-100">
                <CardTitle className="text-sm font-bold text-teal-950 flex items-center gap-1.5">
                  <FileUp className="h-4 w-4 text-teal-700" /> อัปโหลดและนำเข้าข้อมูลเข้าสู่ระบบ
                </CardTitle>
                <CardDescription className="text-xs text-teal-800">
                  เลือกประเภทข้อมูลและอัปโหลดไฟล์ Excel (.xlsx) หรือ CSV
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                {/* Select Import Category */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">เลือกประเภทข้อมูลที่ต้องการนำเข้า</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setImportType("sales")}
                      className={`p-2.5 rounded-lg border text-xs font-bold text-center transition-all ${
                        importType === "sales"
                          ? "bg-teal-700 text-white border-teal-700 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      📊 ยอดขายรายวัน
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportType("stock")}
                      className={`p-2.5 rounded-lg border text-xs font-bold text-center transition-all ${
                        importType === "stock"
                          ? "bg-teal-700 text-white border-teal-700 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      📦 คลังสินค้า
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportType("expenses")}
                      className={`p-2.5 rounded-lg border text-xs font-bold text-center transition-all ${
                        importType === "expenses"
                          ? "bg-teal-700 text-white border-teal-700 shadow-xs"
                          : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      🧾 รายจ่าย
                    </button>
                  </div>
                </div>

                {/* File Upload Input */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-slate-700">เลือกไฟล์ Excel / CSV</Label>
                  <Input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleFileSelected}
                    className="h-10 text-xs bg-white cursor-pointer"
                  />
                  {importFileName && (
                    <div className="text-xs text-teal-800 font-semibold flex items-center gap-1 pt-1">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> ไฟล์ที่เลือก: {importFileName}
                    </div>
                  )}
                </div>

                {/* Preview Table */}
                {previewRows.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-900">
                        ตัวอย่างข้อมูล 5 แถวแรก (ทั้งหมด {rawImportData.length} แถว):
                      </span>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                          <tr>
                            {importHeaders.map((h, i) => (
                              <th key={i} className="px-2.5 py-1.5 text-left whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {previewRows.map((r, rowIdx) => (
                            <tr key={rowIdx} className="hover:bg-slate-50">
                              {importHeaders.map((h, colIdx) => (
                                <td key={colIdx} className="px-2.5 py-1.5 whitespace-nowrap text-slate-800">
                                  {r[h] !== undefined ? String(r[h]) : "—"}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        type="button"
                        disabled={isPending}
                        onClick={handleExecuteImport}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 gap-1.5 shadow-md"
                      >
                        {isPending ? (
                          "กำลังนำเข้าข้อมูล..."
                        ) : (
                          <>
                            <Upload className="h-4 w-4" /> ยืนยันการนำเข้า {rawImportData.length} แถว
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* ── TAB 3: MONTHLY COGS TABLE ── */}
      {activeTab === "cogs" && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900">
                รายงานต้นทุนวัสดุที่ใช้ไป (COGS) รายเดือน
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                สรุปบัญชีต้นทุนคลังสินค้าตามช่วงเดือนที่เลือก
              </CardDescription>
            </div>
            <div className="font-bold text-teal-900 text-sm">
              รวมทั้งสิ้น: ฿{cogsData.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left">เดือน</th>
                  <th className="px-4 py-2.5 text-right">ต้นทุนรวม (บาท)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {cogsData.rows.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-bold text-slate-800">{row.month}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-teal-800">
                      ฿{Number(row.cogs || 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {cogsData.rows.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-slate-400">
                      ไม่พบข้อมูลต้นทุนในช่วงเวลานี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
