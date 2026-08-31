"use client";

import { useState, useTransition } from "react";
import {
  fetchAllExpensesData,
  addExpense,
  deleteExpense,
  type ExpensesPayload,
  type ExpenseActionState,
} from "@/app/actions/expenses";
import { TimeRangeFilterBar } from "@/components/time-range-filter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Wallet,
  Building2,
  Users,
  Plus,
  Trash2,
  Calendar,
  AlertTriangle,
  Receipt,
  FileText,
  DollarSign,
  Home,
  CheckCircle2,
  Sparkles,
} from "lucide-react";

export function ExpensesClient({ initialData }: { initialData: ExpensesPayload }) {
  const [data, setData] = useState<ExpensesPayload>(initialData);
  const [activeTab, setActiveTab] = useState<"opex" | "payroll" | "misc" | "rental">("opex");
  const [isPending, startTransition] = useTransition();

  function handleFilterRange(range: string) {
    startTransition(async () => {
      const updated = await fetchAllExpensesData(range);
      setData(updated);
    });
  }

  async function handleAddExpense(formData: FormData) {
    startTransition(async () => {
      const res = await addExpense(undefined, formData);
      if (res?.error) {
        toast.error(res.error);
      } else if (res?.success) {
        toast.success("บันทึกค่าใช้จ่ายสำเร็จ");
        const updated = await fetchAllExpensesData(data.timeRange);
        setData(updated);
      }
    });
  }

  async function handleDelete(id: string | number) {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?")) return;
    try {
      await deleteExpense(id);
      toast.success("ลบรายการสำเร็จ");
      setData((prev) => ({
        ...prev,
        opexList: prev.opexList.filter((e) => e.id !== id),
      }));
    } catch (err: any) {
      toast.error(err.message || "เกิดข้อผิดพลาด");
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-slate-800 to-slate-900 p-6 text-white shadow-md">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Wallet className="h-3.5 w-3.5" />
            SneakerCare Opex & Payroll System
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ค่าใช้จ่าย & เงินเดือนพนักงาน</h2>
          <p className="text-sm text-teal-100/80">
            บริหารจัดการค่าใช้จ่ายร้าน (Opex), สลิปเงินเดือนพนักงานจริง, รายการหักภาษี ณ ที่จ่าย, และรายรับห้องเช่า
          </p>
        </div>
      </div>

      {/* ── Universal Time Filter Bar (วันนี้ / สัปดาห์นี้ / เดือนนี้ / ปีนี้ / ทั้งหมด) ── */}
      <TimeRangeFilterBar
        selectedRange={data.timeRange}
        onSelectRange={handleFilterRange}
      />

      {/* ── KPI Summary Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Total Opex */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ค่าดำเนินการร้าน (Opex)</span>
              <div className="text-2xl font-black text-rose-600">
                ฿{data.totalOpex.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400">{data.opexList.length} รายการ</div>
            </div>
            <div className="rounded-xl bg-rose-50 p-3 text-rose-600">
              <Building2 className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 2. Total Payroll */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ค่าแรงพนักงานรวม</span>
              <div className="text-2xl font-black text-indigo-600">
                ฿{data.totalPayroll.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400">{data.payslips.length} พนักงาน</div>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
              <Users className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 3. Rental Income */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">รายรับห้องเช่า (ชั้น 3)</span>
              <div className="text-2xl font-black text-emerald-600">
                ฿{data.totalRentalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400">{data.rentals.length} ห้องพัก</div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <Home className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 4. Net Expenses */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">รายจ่ายสุทธิ (หักค่าเช่า)</span>
              <div className="text-2xl font-black text-slate-900">
                ฿{data.netExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400">Opex + Payroll − Rental</div>
            </div>
            <div className="rounded-xl bg-teal-50 p-3 text-teal-700">
              <Wallet className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Sub Navigation Tabs ── */}
      <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 max-w-2xl">
        <button
          type="button"
          onClick={() => setActiveTab("opex")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "opex"
              ? "bg-white text-teal-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Building2 className="h-4 w-4" />
          ค่าดำเนินการร้าน ({data.opexList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("payroll")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "payroll"
              ? "bg-white text-teal-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="h-4 w-4" />
          เงินเดือนพนักงาน ({data.payslips.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("misc")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "misc"
              ? "bg-white text-teal-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Receipt className="h-4 w-4" />
          รายการพิเศษ ({data.miscExpenses.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("rental")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "rental"
              ? "bg-white text-teal-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Home className="h-4 w-4" />
          ห้องเช่า ({data.rentals.length})
        </button>
      </div>

      {/* ── TAB 1: OPEX LIST & ADD FORM ── */}
      {activeTab === "opex" && (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Add Expense Form (4 Cols) */}
          <div className="lg:col-span-4">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="bg-slate-50 border-b border-slate-100 p-4">
                <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Plus className="h-4 w-4 text-teal-700" />
                  บันทึกค่าใช้จ่ายใหม่
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <form action={handleAddExpense} className="space-y-3.5">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">หมวดหมู่</Label>
                    <select
                      name="category"
                      className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium"
                    >
                      <option value="ค่าดำเนินการ">ค่าดำเนินการทั่วไป</option>
                      <option value="ภาษี">ภาษี / ค่าธรรมเนียม</option>
                      <option value="ค่าเช่าร้าน">ค่าเช่าสถานที่</option>
                      <option value="ค่าการตลาด">การตลาด / LINE OA</option>
                      <option value="ค่าซ่อมบำรุง">ซ่อมบำรุง / อุปกรณ์</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">ชื่อรายการ</Label>
                    <Input
                      name="title"
                      placeholder="เช่น ค่าไฟประจำเดือน, ค่าเน็ต 3BB"
                      required
                      className="text-xs h-9"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">จำนวนเงิน (บาท)</Label>
                      <Input
                        name="amount"
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        required
                        className="text-xs h-9 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">ช่องทางจ่าย</Label>
                      <select
                        name="pay_method"
                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-medium"
                      >
                        <option value="บัญชีร้าน">บัญชีร้าน (โอน)</option>
                        <option value="เงินสดร้าน">เงินสดร้าน</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">วันที่จ่าย</Label>
                    <Input
                      name="expense_date"
                      type="date"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="text-xs h-9"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs h-9"
                  >
                    {isPending ? "กำลังบันทึก..." : "บันทึกค่าใช้จ่าย"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Opex Table (8 Cols) */}
          <div className="lg:col-span-8">
            <Card className="border-slate-200 shadow-xs">
              <CardHeader className="border-b border-slate-100 p-4">
                <CardTitle className="text-sm font-bold text-slate-900">
                  รายการค่าใช้จ่ายดำเนินงานร้าน ({data.opexList.length} รายการ)
                </CardTitle>
                <CardDescription className="text-xs">
                  ข้อมูลจริงจากฐานข้อมูลระบบ SneakerCare
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">เดือน</th>
                        <th className="px-4 py-3">รายการ</th>
                        <th className="px-4 py-3">หมวดหมู่</th>
                        <th className="px-4 py-3 text-right">จำนวนเงิน</th>
                        <th className="px-4 py-3">วิธีจ่าย</th>
                        <th className="px-4 py-3 text-center">ลบ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.opexList.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-slate-400">
                            ไม่มีรายการค่าใช้จ่ายในรอบเวลานี้
                          </td>
                        </tr>
                      ) : (
                        data.opexList.map((e) => (
                          <tr key={e.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-mono font-semibold text-teal-800">
                              {e.month}
                            </td>
                            <td className="px-4 py-3 font-semibold text-slate-800">
                              {e.name}
                            </td>
                            <td className="px-4 py-3 text-slate-500">
                              <Badge variant="outline" className="text-[10px]">
                                {e.category}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                              ฿{e.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-[11px]">
                              {e.payMethod}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleDelete(e.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 rounded"
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
        </div>
      )}

      {/* ── TAB 2: STAFF PAYROLL (REAL STAFF: น.ส.สุทธินันท์, นายธีรภัทร) ── */}
      {activeTab === "payroll" && (
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {data.payslips.map((p, idx) => (
              <Card key={idx} className="border-teal-200 shadow-sm overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-teal-900 to-slate-900 text-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                        <Users className="h-4 w-4 text-teal-400" />
                        {p.employeeName}
                      </CardTitle>
                      <CardDescription className="text-xs text-teal-200">
                        รอบเดือน: {p.month} · วิธีจ่าย: {p.payMethod}
                      </CardDescription>
                    </div>
                    <Badge className="bg-teal-500 text-slate-950 font-bold">
                      พนักงานประจำ
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-5 space-y-4">
                  {/* รายได้ (Earnings) */}
                  <div className="space-y-2 rounded-xl bg-slate-50 p-3 border border-slate-200">
                    <div className="text-xs font-bold text-slate-700">รายได้ & ค่าตอบแทน (Earnings)</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">เงินเดือนพื้นฐาน (Base Salary)</span>
                        <span className="font-mono font-bold text-slate-800">
                          ฿{p.baseSalary.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">เบี้ยขยัน (Diligence Allowance)</span>
                        <span className="font-mono text-emerald-600">
                          +฿{p.diligence.toLocaleString()}
                        </span>
                      </div>
                      {p.ot > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">ค่าล่วงเวลา (OT)</span>
                          <span className="font-mono text-emerald-600">+฿{p.ot.toLocaleString()}</span>
                        </div>
                      )}
                      {p.commission > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">ค่าคอมมิชชั่น</span>
                          <span className="font-mono text-emerald-600">+฿{p.commission.toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* รายการหัก (Deductions) */}
                  <div className="space-y-2 rounded-xl bg-rose-50/50 p-3 border border-rose-100">
                    <div className="text-xs font-bold text-rose-900">รายการหัก (Deductions)</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">หักภาษี ณ ที่จ่าย (WHT)</span>
                        <span className="font-mono text-rose-600">
                          -฿{p.wht.toLocaleString()}
                        </span>
                      </div>
                      {p.otherDeductions > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-600">รายการหักอื่นๆ / ประกันสังคม</span>
                          <span className="font-mono text-rose-600">
                            -฿{p.otherDeductions.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ยอดรับสุทธิ (Net Pay) */}
                  <div className="rounded-xl bg-teal-800 p-4 text-white flex items-center justify-between">
                    <div>
                      <span className="text-xs text-teal-200 block">ยอดจ่ายสุทธิ (Net Pay)</span>
                      <span className="text-xl font-black">
                        ฿{p.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className="rounded-lg bg-white/20 p-2 text-white">
                      <CheckCircle2 className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 3: MISC & PARTNER EXPENSES ── */}
      {activeTab === "misc" && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader className="border-b border-slate-100 p-4">
            <CardTitle className="text-sm font-bold text-slate-900">
              รายการค่าใช้จ่ายพิเศษ & พาร์ทเนอร์ ({data.miscExpenses.length} รายการ)
            </CardTitle>
            <CardDescription className="text-xs">
              ค่าที่ปรึกษา, คืนเงินลูกค้า, ค่าบรอดแคสต์ LINE OA, ค่าคอมมิชชั่น และอื่นๆ
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">รอบเดือน</th>
                    <th className="px-4 py-3">รายการ</th>
                    <th className="px-4 py-3">ช่องทางจ่าย</th>
                    <th className="px-4 py-3 text-right">จำนวนเงิน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.miscExpenses.map((m, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80">
                      <td className="px-4 py-3 font-mono font-semibold text-teal-800">{m.month}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{m.name}</td>
                      <td className="px-4 py-3 text-slate-500">{m.method}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                        ฿{m.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── TAB 4: RENTAL INCOME & METERS ── */}
      {activeTab === "rental" && (
        <div className="grid gap-4 md:grid-cols-3">
          {data.rentals.map((r, idx) => (
            <Card key={idx} className="border-slate-200 shadow-xs">
              <CardHeader className="bg-slate-50 p-4 border-b border-slate-100">
                <CardTitle className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Home className="h-4 w-4 text-teal-700" />
                  {r.roomName}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  ผู้เช่า: {r.tenantName} · รอบ: {r.month}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">ค่าเช่ารายเดือน:</span>
                  <span className="font-mono font-bold text-emerald-600">
                    ฿{r.rentAmount.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
