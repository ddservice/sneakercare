"use client";

import { useState, useTransition } from "react";
import {
  parseAndStageReceiptOcr,
  approveStagedExpense,
  verifyBankSlipAction,
} from "@/app/actions/smartacc-expenses";
import type { SlipVerificationResult } from "@/lib/smartacc/slip-verifier";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ScanLine,
  Camera,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  ShieldCheck,
  Building2,
  Receipt,
  Plus,
} from "lucide-react";

export type StagedExpenseItem = {
  id: string;
  extracted_vendor_name: string;
  extracted_tax_id: string;
  extracted_date: string;
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  suggested_account_code: string;
  approval_status: string;
  ext_chart_of_accounts?: { account_name_th?: string } | null;
};

export function ExpensesOcrClient({
  initialExpenses,
}: {
  initialExpenses: StagedExpenseItem[];
}) {
  const [expenses, setExpenses] = useState<StagedExpenseItem[]>(initialExpenses);
  const [activeTab, setActiveTab] = useState<"receipt_ocr" | "slip_verify">("receipt_ocr");
  const [isPending, startTransition] = useTransition();

  // Slip verification state
  const [qrInput, setQrInput] = useState("");
  const [slipResult, setSlipResult] = useState<SlipVerificationResult | null>(null);

  async function handleSimulateCameraCapture() {
    startTransition(async () => {
      try {
        const res = await parseAndStageReceiptOcr("data:image/jpeg;base64,mockReceiptPhoto");
        if (res.success) {
          toast.success("OCR อ่านข้อมูลใบเสร็จและแมปผังบัญชีเรียบร้อย");
          setExpenses([res.expense, ...expenses]);
        }
      } catch (err: any) {
        toast.error(err.message || "ไม่สามารถประมวลผลใบเสร็จได้");
      }
    });
  }

  async function handleApproveExpense(id: string) {
    startTransition(async () => {
      try {
        await approveStagedExpense(id);
        toast.success("อนุมัติรายการค่าใช้จ่ายเข้าบัญชีเรียบร้อย");
        setExpenses(
          expenses.map((e) =>
            e.id === id ? { ...e, approval_status: "APPROVED" } : e
          )
        );
      } catch (err: any) {
        toast.error(err.message || "เกิดข้อผิดพลาด");
      }
    });
  }

  async function handleVerifySlip() {
    if (!qrInput) {
      toast.error("กรุณากรอกหรือสแกน Payload QR สลิปโอนเงิน");
      return;
    }

    startTransition(async () => {
      const res = await verifyBankSlipAction(qrInput);
      setSlipResult(res);
      if (res.isValid) {
        toast.success(`ตรวจสอบสลิปสำเร็จ: TransRef ${res.transRef}`);
      } else {
        toast.error(res.error || "สลิปไม่ถูกต้องหรือถูกใช้งานไปแล้ว");
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-md bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-800 border border-teal-200">
            <ScanLine className="h-3.5 w-3.5" />
            Mobile OCR & Slip Auto-Verification
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            สแกนใบเสร็จ & ตรวจสลิปอัตโนมัติ
          </h2>
          <p className="text-xs text-slate-500">
            ระบบ OCR ถอดข้อความใบเสร็จภาษาไทย แมปผังบัญชีอัตโนมัติ และตรวจสลิปโอนเงินป้องกันสลิปซ้ำ
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => setActiveTab("receipt_ocr")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "receipt_ocr"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Camera className="h-3.5 w-3.5 inline mr-1" /> สแกนใบเสร็จ (Expense OCR)
          </button>
          <button
            onClick={() => setActiveTab("slip_verify")}
            className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeTab === "slip_verify"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 hover:bg-slate-200"
            }`}
          >
            <QrCode className="h-3.5 w-3.5 inline mr-1" /> ตรวจสลิปธนาคาร (Slip Verifier)
          </button>
        </div>
      </div>

      {/* ── TAB 1: EXPENSE OCR PIPELINE ── */}
      {activeTab === "receipt_ocr" && (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Mobile Camera / Ingestion Box (4 cols) */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Camera className="h-4 w-4 text-teal-700" />
                  ถ่ายรูป / อัปโหลดใบเสร็จ
                </CardTitle>
                <CardDescription className="text-xs">
                  ระบบจะวิเคราะห์ข้อความ แยกยอด VAT และแมปผังบัญชี
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4 text-center">
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 bg-slate-50/50 flex flex-col items-center justify-center space-y-3">
                  <div className="rounded-full bg-teal-50 p-4 text-teal-700 border border-teal-200">
                    <Receipt className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-800">
                      ลากไฟล์รูปภาพมาวางที่นี่
                    </p>
                    <p className="text-[11px] text-slate-500">รองรับไฟล์ JPG, PNG, PDF</p>
                  </div>
                  <Button
                    type="button"
                    disabled={isPending}
                    onClick={handleSimulateCameraCapture}
                    className="bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold gap-1.5 h-9"
                  >
                    <Camera className="h-4 w-4" />
                    {isPending ? "กำลังอ่านข้อมูล OCR..." : "สแกนใบเสร็จทันที"}
                  </Button>
                </div>

                <div className="rounded-lg bg-teal-50/60 p-3 text-left border border-teal-100 text-[11px] text-teal-900 space-y-1">
                  <div className="font-bold flex items-center gap-1 text-teal-800">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Quarantine Staging Engine:
                  </div>
                  <p>
                    ข้อมูลที่ OCR อ่านได้จะเข้าสู่ตารางรอตรวจสอบ (Staged Table) เพื่อให้ผู้ดูแลตรวจสอบก่อนอนุมัติเข้าบัญชีจริง
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Staged Expenses Table (8 cols) */}
          <div className="lg:col-span-8">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold">
                    รายการรอตรวจสอบและอนุมัติ (Quarantine Staging)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    รายการค่าใช้จ่ายที่ผ่านการสกัดข้อความด้วย OCR
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  ทั้งหมด {expenses.length} รายการ
                </Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-100 bg-slate-50 text-slate-600 uppercase font-semibold">
                      <tr>
                        <th className="px-3 py-2.5">วันที่</th>
                        <th className="px-3 py-2.5">ผู้ขาย / ร้านค้า</th>
                        <th className="px-3 py-2.5">ผังบัญชีที่แนะนำ</th>
                        <th className="px-3 py-2.5 text-right">ยอดรวม</th>
                        <th className="px-3 py-2.5 text-center">สถานะ</th>
                        <th className="px-3 py-2.5 text-center">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {expenses.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            ยังไม่มีรายการสแกนใบเสร็จในคิวตรวจสอบ
                          </td>
                        </tr>
                      ) : (
                        expenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-slate-50">
                            <td className="px-3 py-3 font-mono text-slate-500">
                              {exp.extracted_date}
                            </td>
                            <td className="px-3 py-3">
                              <div className="font-semibold text-slate-900">
                                {exp.extracted_vendor_name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Tax ID: {exp.extracted_tax_id}
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Badge variant="outline" className="text-[10px] font-normal">
                                {exp.suggested_account_code} - {exp.ext_chart_of_accounts?.account_name_th || "ค่าใช้จ่ายดำเนินงาน"}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-slate-900">
                              ฿{exp.total_amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-3 py-3 text-center">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${
                                  exp.approval_status === "APPROVED"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {exp.approval_status === "APPROVED" ? "อนุมัติแล้ว" : "รอตรวจสอบ"}
                              </Badge>
                            </td>
                            <td className="px-3 py-3 text-center">
                              {exp.approval_status !== "APPROVED" && (
                                <Button
                                  size="sm"
                                  disabled={isPending}
                                  onClick={() => handleApproveExpense(exp.id)}
                                  className="h-7 text-[11px] bg-teal-700 hover:bg-teal-800 text-white"
                                >
                                  อนุมัติ
                                </Button>
                              )}
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
        </div>
      )}

      {/* ── TAB 2: SLIP AUTO-VERIFIER ── */}
      {activeTab === "slip_verify" && (
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-6 space-y-4">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 pb-3">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-teal-700" />
                  สแกนหรือระบุข้อมูล QR สลิปธนาคาร
                </CardTitle>
                <CardDescription className="text-xs">
                  ตรวจสอบความถูกต้องของสลิป ยอดเงิน และป้องกันการใช้สลิปซ้ำ
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-slate-700">
                    QR Code Payload หรือ เลขที่อ้างอิงธุรกรรม (TransRef)
                  </Label>
                  <Input
                    value={qrInput}
                    onChange={(e) => setQrInput(e.target.value)}
                    placeholder="เช่น 0046000600000101030140225... หรือ TR-20260830-1001"
                    className="text-xs font-mono h-9"
                  />
                </div>

                <Button
                  type="button"
                  disabled={isPending}
                  onClick={handleVerifySlip}
                  className="w-full bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold h-10"
                >
                  {isPending ? "กำลังตรวจสอบสลิป..." : "ตรวจสอบสลิปโอนเงินทันที"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-6">
            {slipResult ? (
              <Card className={`shadow-xs border ${slipResult.isValid ? "border-emerald-200 bg-emerald-50/40" : "border-rose-200 bg-rose-50/40"}`}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    {slipResult.isValid ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        <span className="text-emerald-900">สลิปถูกต้องสมบูรณ์ (Verified)</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-5 w-5 text-rose-600" />
                        <span className="text-rose-900">ตรวจพบข้อผิดพลาด</span>
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-5 pt-0 space-y-3 text-xs">
                  {slipResult.isValid ? (
                    <div className="space-y-2">
                      <div className="flex justify-between border-b border-emerald-100 pb-1.5">
                        <span className="text-slate-600">Transaction Reference:</span>
                        <span className="font-mono font-bold text-emerald-900">{slipResult.transRef}</span>
                      </div>
                      <div className="flex justify-between border-b border-emerald-100 pb-1.5">
                        <span className="text-slate-600">ธนาคารต้นทาง:</span>
                        <span className="font-semibold text-slate-800">{slipResult.sendingBank}</span>
                      </div>
                      <div className="flex justify-between border-b border-emerald-100 pb-1.5">
                        <span className="text-slate-600">ยอดเงินที่โอน:</span>
                        <span className="font-mono font-bold text-emerald-800 text-sm">฿{slipResult.amount?.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">เวลาที่ทำรายการ:</span>
                        <span className="text-slate-800">{new Date(slipResult.transDate!).toLocaleString("th-TH")}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-rose-700">
                      {slipResult.error}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-xl border border-slate-200 p-8 text-center text-xs text-slate-400 bg-white">
                ยังไม่มีข้อมูลการตรวจสอบสลิป
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
