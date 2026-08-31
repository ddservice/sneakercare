"use client";

import { useState, useTransition } from "react";
import {
  fetchAllExpensesData,
  addExpense,
  deleteExpense,
  type ExpensesPayload,
  type StaffPayslip,
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
  Receipt,
  Home,
  CheckCircle2,
  Sparkles,
  Printer,
  X,
  CreditCard,
  Check,
  Calculator,
  UserPlus,
  Edit3,
  TrendingUp,
  Percent,
} from "lucide-react";

export function ExpensesClient({ initialData }: { initialData: ExpensesPayload }) {
  const [data, setData] = useState<ExpensesPayload>(initialData);
  const [activeTab, setActiveTab] = useState<"payroll" | "opex" | "misc" | "rental">("payroll");
  const [isPending, startTransition] = useTransition();

  // Print Payslip Modal State
  const [selectedPayslip, setSelectedPayslip] = useState<StaffPayslip | null>(null);

  // Edit/Adjust Staff Modal State
  const [editingStaff, setEditingStaff] = useState<StaffPayslip | null>(null);

  // New Staff / Daily Wage Modal State
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [staffFormType, setStaffFormType] = useState<"monthly" | "probation_daily">("probation_daily");
  const [dailyRate, setDailyRate] = useState<number>(350);
  const [daysWorked, setDaysWorked] = useState<number>(26);

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

  // Save / Update Staff Payslip with Diligence, Commission, OT, and Deductions
  function handleSaveStaffAdjustment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingStaff) return;

    const form = e.currentTarget;
    const empType = (form.elements.namedItem("employment_type") as HTMLSelectElement)?.value as "monthly" | "probation_daily";
    const days = parseFloat((form.elements.namedItem("days_worked") as HTMLInputElement)?.value || "26");
    const rate = parseFloat((form.elements.namedItem("daily_wage") as HTMLInputElement)?.value || "350");
    const baseSal = empType === "monthly"
      ? parseFloat((form.elements.namedItem("base_salary") as HTMLInputElement)?.value || "12000")
      : days * rate;
    const diligence = parseFloat((form.elements.namedItem("diligence") as HTMLInputElement)?.value || "0");
    const ot = parseFloat((form.elements.namedItem("ot") as HTMLInputElement)?.value || "0");
    const commPct = parseFloat((form.elements.namedItem("comm_pct") as HTMLSelectElement)?.value || "0");
    const otherDeduct = parseFloat((form.elements.namedItem("other_deduct") as HTMLInputElement)?.value || "0");

    // Commission = Monthly Sales * commPct%
    const commission = Math.round((data.totalMonthlySales * commPct) / 100);
    // WHT = 3% on commission ONLY (ตามระบบเดิม)
    const wht = Math.round(commission * 0.03);
    // SSO = 5% for monthly staff (600฿), 0 for daily probation
    const sso = empType === "monthly" ? 600 : 0;

    const netPay = baseSal + diligence + ot + commission - wht - sso - otherDeduct;

    const updatedPayslip: StaffPayslip = {
      ...editingStaff,
      employmentType: empType,
      daysWorked: empType === "probation_daily" ? days : undefined,
      dailyWage: empType === "probation_daily" ? rate : undefined,
      baseSalary: baseSal,
      diligence,
      ot,
      commPct,
      commission,
      wht,
      ssoDeduction: sso,
      otherDeductions: otherDeduct,
      netPay,
    };

    setData((prev) => {
      const updatedList = prev.payslips.map((p) =>
        p.employeeName === editingStaff.employeeName ? updatedPayslip : p
      );
      const newTotal = updatedList.reduce((sum, p) => sum + p.netPay, 0);
      return {
        ...prev,
        payslips: updatedList,
        totalPayroll: newTotal,
        netExpenses: newTotal + prev.totalOpex - prev.totalRentalIncome,
      };
    });

    toast.success(`อัปเดตข้อมูลค่าแรง & สลิปของ ${editingStaff.employeeName} สำเร็จ`);
    setEditingStaff(null);
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
          <h2 className="text-2xl font-bold tracking-tight">ค่าใช้จ่าย & ระบบจ่ายเงินเดือนพนักงาน</h2>
          <p className="text-sm text-teal-100/80">
            จัดการเงินเดือนพนักงานประจำ (เชียง, มิ้ว), ค่าจ้างทดลองงานรายวัน (เจ - 350฿/วัน), เบี้ยขยัน, ค่าคอมมิชชั่น % ยอดขาย และหัก ณ ที่จ่าย 3%
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowAddStaffModal(true)}
            className="bg-teal-400 font-bold hover:bg-teal-300 text-slate-950 text-xs gap-1.5 shadow-sm"
          >
            <UserPlus className="h-4 w-4" /> + เพิ่มพนักงานใหม่
          </Button>
        </div>
      </div>

      {/* ── Universal Time Filter Bar ── */}
      <TimeRangeFilterBar
        selectedRange={data.timeRange}
        onSelectRange={handleFilterRange}
      />

      {/* ── KPI Summary Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Total Payroll */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ยอดเงินเดือน & ค่าจ้างรวม</span>
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

        {/* 2. Total Opex */}
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

        {/* 3. Monthly Sales for Commission */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ยอดขายร้านประจำงวด (ฐานคิดคอม)</span>
              <div className="text-2xl font-black text-emerald-600">
                ฿{data.totalMonthlySales.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400">จากระบบ sc_sales</div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <TrendingUp className="h-6 w-6" />
            </div>
          </CardContent>
        </Card>

        {/* 4. Net Expenses */}
        <Card className="border-slate-200 shadow-2xs">
          <CardContent className="p-5 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">รวมรายจ่ายสุทธิทั้งสิ้น</span>
              <div className="text-2xl font-black text-slate-900">
                ฿{data.netExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400">Payroll + Opex − Rental</div>
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
          onClick={() => setActiveTab("payroll")}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === "payroll"
              ? "bg-white text-teal-900 shadow-xs"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Users className="h-4 w-4" />
          เงินเดือน & ค่าคอม ({data.payslips.length})
        </button>
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

      {/* ── TAB 1: STAFF PAYROLL, COMMISSIONS & ADJUSTMENTS ── */}
      {activeTab === "payroll" && (
        <div className="space-y-6">
          {/* Shop Structure Overview Banner */}
          <div className="rounded-2xl border border-teal-700/60 bg-gradient-to-r from-teal-950 to-slate-900 p-6 text-white shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-400 p-2.5 text-slate-950">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-300">
                    <Sparkles className="h-3.5 w-3.5" /> โครงสร้างพนักงานร้าน SneakerCare ประจำงวด
                  </div>
                  <h3 className="text-xl font-black text-white">
                    รวมยอดจ่ายเงินเดือนสุทธิ: ฿{data.totalPayroll.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="rounded-xl bg-white/10 px-3 py-1.5 text-xs text-teal-200">
                  ฐานยอดขายร้านคิดค่าคอม: <strong className="text-white font-mono">฿{data.totalMonthlySales.toLocaleString()}</strong>
                </div>
              </div>
            </div>

            {/* Quick 3-Staff Summary Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur-xs space-y-1">
                <div className="text-xs text-teal-200 flex items-center justify-between">
                  <span>1. นายธีรภัทร ทาแผ (เชียง)</span>
                  <Badge className="bg-teal-600 text-white text-[10px]">พนักงานประจำ</Badge>
                </div>
                <div className="text-lg font-black text-teal-300">
                  ฿{data.payslips.find((p) => p.employeeName.includes("ธีรภัทร") || p.employeeName.includes("เชียง"))?.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 }) || "11,900.00"}
                </div>
                <div className="text-[10px] text-teal-200/80">ฐาน 12,000 + เบี้ยขยัน 500 − ปกส. 600</div>
              </div>

              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur-xs space-y-1">
                <div className="text-xs text-teal-200 flex items-center justify-between">
                  <span>2. น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว)</span>
                  <Badge className="bg-indigo-600 text-white text-[10px]">พนักงานประจำ</Badge>
                </div>
                <div className="text-lg font-black text-teal-300">
                  ฿{data.payslips.find((p) => p.employeeName.includes("สุทธินันท์") || p.employeeName.includes("มิ้ว"))?.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 }) || "11,900.00"}
                </div>
                <div className="text-[10px] text-teal-200/80">ฐาน 12,000 + เบี้ยขยัน 500 − ปกส. 600</div>
              </div>

              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur-xs space-y-1">
                <div className="text-xs text-teal-200 flex items-center justify-between">
                  <span>3. เจ (พนักงานทดลองงาน)</span>
                  <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">ทดลองงาน 350฿/วัน</Badge>
                </div>
                <div className="text-lg font-black text-amber-300">
                  ฿{data.payslips.find((p) => p.employeeName === "เจ (พนักงานทดลองงาน)")?.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 }) || "9,600.00"}
                </div>
                <div className="text-[10px] text-teal-200/80">ทำงาน 26 วัน x 350฿ + เบี้ยขยัน (ไม่หัก ปกส.)</div>
              </div>
            </div>
          </div>

          {/* Individual Payslips Cards */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.payslips.map((p, idx) => (
              <Card key={idx} className="border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between hover:border-teal-400 transition-all">
                <div>
                  <CardHeader className="bg-slate-50/80 border-b border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Users className="h-4 w-4 text-teal-700" />
                          {p.employeeName}
                        </CardTitle>
                        <CardDescription className="text-[11px] text-slate-500">
                          {p.employeeRole || "พนักงานประจำ"} · รอบ: {p.month}
                        </CardDescription>
                      </div>
                      <Badge
                        className={
                          p.employmentType === "probation_daily"
                            ? "bg-amber-500 text-slate-950 font-bold text-[10px]"
                            : "bg-teal-700 text-white font-semibold text-[10px]"
                        }
                      >
                        {p.employmentType === "probation_daily" ? "ทดลองงาน (350฿/วัน)" : "พนักงานประจำ"}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3.5">
                    {/* รายได้ (Earnings) */}
                    <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 border border-slate-200">
                      <div className="text-[11px] font-bold text-slate-700 flex justify-between items-center">
                        <span>รายได้ & ค่าตอบแทน (Earnings)</span>
                        {p.employmentType === "probation_daily" && (
                          <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                            {p.daysWorked || 26} วัน x {p.dailyWage || 350}฿
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-600">
                            {p.employmentType === "probation_daily" ? "ค่าจ้างตามวันทำงาน:" : "เงินเดือนพื้นฐาน:"}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            ฿{p.baseSalary.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-600">เบี้ยขยัน:</span>
                          <span className="font-mono text-emerald-600">+฿{p.diligence.toLocaleString()}</span>
                        </div>
                        {p.ot > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">ค่าล่วงเวลา (OT):</span>
                            <span className="font-mono text-emerald-600">+฿{p.ot.toLocaleString()}</span>
                          </div>
                        )}
                        {p.commission > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">ค่าคอมมิชชั่น ({p.commPct}%):</span>
                            <span className="font-mono text-emerald-600">+฿{p.commission.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* รายการหัก (Deductions) */}
                    <div className="space-y-1.5 rounded-xl bg-rose-50/50 p-3 border border-rose-100">
                      <div className="text-[11px] font-bold text-rose-900">รายการหัก (Deductions)</div>
                      <div className="space-y-1 text-xs">
                        {p.ssoDeduction > 0 ? (
                          <div className="flex justify-between">
                            <span className="text-slate-600">ประกันสังคม (5%):</span>
                            <span className="font-mono text-rose-600">-฿{p.ssoDeduction.toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-slate-400 text-[11px]">
                            <span>ประกันสังคม:</span>
                            <span>ยกเว้น (ช่วงทดลองงาน)</span>
                          </div>
                        )}
                        {p.wht > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">หัก ณ ที่จ่าย 3% (เฉพาะค่าคอม):</span>
                            <span className="font-mono text-rose-600">-฿{p.wht.toLocaleString()}</span>
                          </div>
                        )}
                        {p.otherDeductions > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">รายการหักอื่นๆ:</span>
                            <span className="font-mono text-rose-600">-฿{p.otherDeductions.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ยอดรับสุทธิ (Net Pay) */}
                    <div className="rounded-xl bg-teal-900 p-3.5 text-white flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-teal-200 block">ยอดโอนสุทธิ (Net Pay)</span>
                        <span className="text-lg font-black font-mono">
                          ฿{p.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="rounded-lg bg-teal-700/50 p-1.5 text-white">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>
                    </div>
                  </CardContent>
                </div>

                {/* Actions: Edit & Print */}
                <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingStaff(p)}
                    className="text-xs text-slate-700 hover:text-teal-800 gap-1 font-semibold"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-teal-700" /> ปรับยอด / เบี้ยขยัน
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedPayslip(p)}
                    className="text-xs gap-1.5 border-teal-600 text-teal-800 hover:bg-teal-50 font-bold"
                  >
                    <Printer className="h-3.5 w-3.5" /> สลิปเงินเดือน
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ── TAB 2: OPEX LIST & ADD FORM ── */}
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

      {/* ── EDIT / ADJUST STAFF MODAL (เบี้ยขยัน, ค่าคอม %, OT, วันทำงาน) ── */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Edit3 className="h-4 w-4 text-teal-700" />
                  ปรับแก้ค่าแรง & เบี้ยขยัน: {editingStaff.employeeName}
                </h3>
                <p className="text-[11px] text-slate-500">งวดเดือน {editingStaff.month}</p>
              </div>
              <button onClick={() => setEditingStaff(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaffAdjustment} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-semibold">ประเภทการจ้างงาน</Label>
                  <select
                    name="employment_type"
                    defaultValue={editingStaff.employmentType}
                    className="w-full rounded-lg border border-slate-200 p-2 font-medium"
                  >
                    <option value="monthly">พนักงานประจำ (เงินเดือน)</option>
                    <option value="probation_daily">ทดลองงาน (วันละ 350฿)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <Label className="font-semibold">เงินเดือนฐาน หรือ อัตราวันละ</Label>
                  <Input
                    name={editingStaff.employmentType === "monthly" ? "base_salary" : "daily_wage"}
                    defaultValue={editingStaff.employmentType === "monthly" ? editingStaff.baseSalary : (editingStaff.dailyWage || 350)}
                    className="h-9 font-mono"
                  />
                </div>
              </div>

              {editingStaff.employmentType === "probation_daily" && (
                <div className="space-y-1 bg-amber-50 p-2.5 rounded-xl border border-amber-200">
                  <Label className="font-semibold text-amber-900">จำนวนวันที่มาทำงานในเดือนนี้ (วัน)</Label>
                  <Input
                    name="days_worked"
                    type="number"
                    defaultValue={editingStaff.daysWorked || 26}
                    className="h-8 font-mono bg-white"
                  />
                  <span className="text-[10px] text-amber-800">
                    คำนวณฐานค่าแรง: {editingStaff.daysWorked || 26} วัน x 350฿ = ฿{((editingStaff.daysWorked || 26) * 350).toLocaleString()}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="font-semibold text-emerald-700">เบี้ยขยัน (บาท)</Label>
                  <Input
                    name="diligence"
                    type="number"
                    defaultValue={editingStaff.diligence}
                    className="h-9 font-mono"
                    placeholder="เช่น 500"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="font-semibold text-emerald-700">ค่าล่วงเวลา OT (บาท)</Label>
                  <Input
                    name="ot"
                    type="number"
                    defaultValue={editingStaff.ot}
                    className="h-9 font-mono"
                    placeholder="เช่น 675"
                  />
                </div>
              </div>

              {/* Commission Calculator from Sales */}
              <div className="space-y-1.5 rounded-xl bg-teal-50/70 p-3 border border-teal-200">
                <div className="flex justify-between items-center">
                  <Label className="font-bold text-teal-900 flex items-center gap-1">
                    <Percent className="h-3.5 w-3.5 text-teal-700" /> ค่าคอมมิชชั่น / ค่าอินเซนทีฟ (% ยอดขายร้าน)
                  </Label>
                  <span className="text-[10px] font-bold text-teal-800">
                    ยอดขายร้าน: ฿{data.totalMonthlySales.toLocaleString()}
                  </span>
                </div>
                <select
                  name="comm_pct"
                  defaultValue={editingStaff.commPct || 0}
                  className="w-full rounded-lg border border-teal-300 bg-white p-2 font-semibold text-teal-900"
                >
                  <option value="0">ไม่มีค่าคอม (0%)</option>
                  <option value="1">1% (ประมาณ ฿{(data.totalMonthlySales * 0.01).toLocaleString()})</option>
                  <option value="2">2% (ประมาณ ฿{(data.totalMonthlySales * 0.02).toLocaleString()})</option>
                  <option value="3">3% (ประมาณ ฿{(data.totalMonthlySales * 0.03).toLocaleString()})</option>
                  <option value="5">5% (ประมาณ ฿{(data.totalMonthlySales * 0.05).toLocaleString()})</option>
                  <option value="10">10% (ประมาณ ฿{(data.totalMonthlySales * 0.10).toLocaleString()})</option>
                </select>
                <p className="text-[10px] text-teal-700">
                  * หากมีค่าคอมมิชชั่น ระบบจะคำนวณหักภาษี ณ ที่จ่าย 3% เฉพาะยอดค่าคอมให้อัตโนมัติตามกฎหมาย
                </p>
              </div>

              <div className="space-y-1">
                <Label className="font-semibold text-rose-700">รายการหักอื่นๆ (บาท — ขาด/ลา/สาย/เงินประกัน)</Label>
                <Input
                  name="other_deduct"
                  type="number"
                  defaultValue={editingStaff.otherDeductions}
                  className="h-9 font-mono"
                  placeholder="0"
                />
              </div>

              <Button type="submit" className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold h-9">
                บันทึกการปรับยอด & คำนวณเงินเดือนใหม่
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── ADD NEW STAFF MODAL ── */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-teal-700" />
                เพิ่มข้อมูลพนักงานใหม่
              </h3>
              <button onClick={() => setShowAddStaffModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = (form.elements.namedItem("new_emp_name") as HTMLInputElement)?.value.trim();
                if (!name) return;
                const type = staffFormType;
                const base = type === "monthly" ? 12000 : daysWorked * dailyRate;
                const sso = type === "monthly" ? 600 : 0;
                const net = base + 500 - sso;

                const newStaff: StaffPayslip = {
                  employeeName: name,
                  month: "08/2026",
                  employmentType: type,
                  daysWorked: type === "probation_daily" ? daysWorked : undefined,
                  dailyWage: type === "probation_daily" ? dailyRate : undefined,
                  baseSalary: base,
                  diligence: 500,
                  ot: 0,
                  commission: 0,
                  wht: 0,
                  ssoDeduction: sso,
                  otherDeductions: 0,
                  netPay: net,
                  payMethod: "บัญชีร้าน (โอน)",
                  employeeRole: type === "monthly" ? "พนักงานประจำ" : "พนักงานทดลองงาน (350฿/วัน)",
                };

                setData((prev) => ({
                  ...prev,
                  payslips: [...prev.payslips, newStaff],
                  totalPayroll: prev.totalPayroll + net,
                }));
                toast.success(`เพิ่มพนักงาน ${name} เรียบร้อยแล้ว`);
                setShowAddStaffModal(false);
              }}
              className="space-y-4 text-xs"
            >
              <div className="space-y-1">
                <Label className="font-semibold">ชื่อ-นามสกุล หรือชื่อเล่นพนักงาน</Label>
                <Input name="new_emp_name" placeholder="ระบุชื่อพนักงาน" required className="h-9" />
              </div>

              <div className="space-y-1">
                <Label className="font-semibold">รูปแบบการจ้างงาน</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setStaffFormType("probation_daily")}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      staffFormType === "probation_daily"
                        ? "bg-amber-500 text-slate-950 border-amber-500"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    ทดลองงาน (วันละ 350฿)
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffFormType("monthly")}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      staffFormType === "monthly"
                        ? "bg-teal-800 text-white border-teal-800"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    พนักงานประจำ (เงินเดือน)
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold h-9">
                บันทึกพนักงานใหม่
              </Button>
            </form>
          </div>
        </div>
      )}

      {/* ── PRINTABLE PAYSLIP MODAL ── */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs print:p-0 print:bg-white">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 print:shadow-none print:border-none print:max-w-none print:w-full space-y-6">
            {/* Modal Actions */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 print:hidden">
              <span className="text-sm font-bold text-slate-800">ใบแจ้งเงินเดือน / สลิปเงินเดือนพนักงาน</span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" /> พิมพ์สลิป (Print)
                </Button>
                <button
                  onClick={() => setSelectedPayslip(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Payslip A4/A5 Document Content */}
            <div className="space-y-4 text-slate-900 font-sans">
              {/* Company Header */}
              <div className="text-center space-y-1 border-b border-slate-200 pb-4">
                <h2 className="text-lg font-black text-slate-900">บริษัท รวยรับทรัพย์168 จำกัด</h2>
                <p className="text-xs text-slate-600">
                  SneakerCare 552/4 ถ.เชียงใหม่-ลำพูน ต.หนองหอย อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50000
                </p>
                <div className="text-xs font-bold text-teal-800 pt-1">
                  ใบแจ้งเงินเดือนพนักงาน (PAYSLIP) ประจำงวดเดือน {selectedPayslip.month}
                </div>
              </div>

              {/* Employee Info */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500">ชื่อ-นามสกุล: </span>
                  <span className="font-bold">{selectedPayslip.employeeName}</span>
                </div>
                <div>
                  <span className="text-slate-500">สถานะ: </span>
                  <span className="font-semibold">
                    {selectedPayslip.employmentType === "probation_daily" ? "พนักงานทดลองงาน" : "พนักงานประจำ"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">รอบการจ่าย: </span>
                  <span>สิ้นเดือน ({selectedPayslip.month})</span>
                </div>
                <div>
                  <span className="text-slate-500">ช่องทาง: </span>
                  <span>{selectedPayslip.payMethod}</span>
                </div>
              </div>

              {/* Table of Earnings & Deductions */}
              <table className="w-full text-xs border border-slate-200">
                <thead className="bg-slate-100 font-bold border-b border-slate-200">
                  <tr>
                    <th className="p-2.5 text-left w-1/2">รายการรับ (Earnings)</th>
                    <th className="p-2.5 text-left w-1/2">รายการหัก (Deductions)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="p-2.5 align-top space-y-1 border-r border-slate-200">
                      <div className="flex justify-between">
                        <span>
                          {selectedPayslip.employmentType === "probation_daily"
                            ? `ค่าจ้างรายวัน (${selectedPayslip.daysWorked || 26} วัน @ ${selectedPayslip.dailyWage || 350}฿):`
                            : "เงินเดือนพื้นฐาน:"}
                        </span>
                        <span className="font-mono font-semibold">฿{selectedPayslip.baseSalary.toLocaleString()}</span>
                      </div>
                      {selectedPayslip.diligence > 0 && (
                        <div className="flex justify-between">
                          <span>เบี้ยขยัน:</span>
                          <span className="font-mono font-semibold">฿{selectedPayslip.diligence.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedPayslip.ot > 0 && (
                        <div className="flex justify-between">
                          <span>ค่าล่วงเวลา (OT):</span>
                          <span className="font-mono font-semibold">฿{selectedPayslip.ot.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedPayslip.commission > 0 && (
                        <div className="flex justify-between">
                          <span>ค่าคอมมิชชั่น ({selectedPayslip.commPct}%):</span>
                          <span className="font-mono font-semibold">฿{selectedPayslip.commission.toLocaleString()}</span>
                        </div>
                      )}
                    </td>
                    <td className="p-2.5 align-top space-y-1">
                      {selectedPayslip.ssoDeduction > 0 ? (
                        <div className="flex justify-between">
                          <span>ประกันสังคม (5%):</span>
                          <span className="font-mono font-semibold">-฿{selectedPayslip.ssoDeduction.toLocaleString()}</span>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-[11px]">ไม่มีรายการหักประกันสังคม</div>
                      )}
                      {selectedPayslip.wht > 0 && (
                        <div className="flex justify-between">
                          <span>ภาษีหัก ณ ที่จ่าย 3% (เฉพาะคอม):</span>
                          <span className="font-mono font-semibold">-฿{selectedPayslip.wht.toLocaleString()}</span>
                        </div>
                      )}
                      {selectedPayslip.otherDeductions > 0 && (
                        <div className="flex justify-between">
                          <span>รายการหักอื่นๆ:</span>
                          <span className="font-mono font-semibold">-฿{selectedPayslip.otherDeductions.toLocaleString()}</span>
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>
                <tfoot className="bg-teal-50/70 border-t-2 border-slate-300 font-bold">
                  <tr>
                    <td className="p-2.5 border-r border-slate-200">
                      <div className="flex justify-between">
                        <span>รวมรายได้:</span>
                        <span className="font-mono text-emerald-700">
                          ฿{(selectedPayslip.baseSalary + selectedPayslip.diligence + selectedPayslip.ot + selectedPayslip.commission).toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="flex justify-between">
                        <span>รวมรายการหัก:</span>
                        <span className="font-mono text-rose-700">
                          -฿{(selectedPayslip.ssoDeduction + selectedPayslip.wht + selectedPayslip.otherDeductions).toLocaleString()}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr className="bg-teal-900 text-white text-sm">
                    <td colSpan={2} className="p-3">
                      <div className="flex justify-between items-center">
                        <span className="font-bold">ยอดเงินได้สุทธิที่ได้รับ (Net Pay):</span>
                        <span className="text-base font-black">
                          ฿{selectedPayslip.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                        </span>
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-6 pt-6 text-center text-xs">
                <div className="space-y-6">
                  <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pb-6"></div>
                  <div>ลงชื่อ .....................................................<br /><span className="text-[10px] text-slate-500">(ผู้จ่ายเงิน / ผู้มีอำนาจลงนาม)</span></div>
                </div>
                <div className="space-y-6">
                  <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto pb-6"></div>
                  <div>ลงชื่อ .....................................................<br /><span className="text-[10px] text-slate-500">(ผู้รับเงิน / พนักงาน)</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
