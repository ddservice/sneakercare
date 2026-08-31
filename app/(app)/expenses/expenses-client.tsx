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
  Calendar,
  AlertTriangle,
  Receipt,
  FileText,
  DollarSign,
  Home,
  CheckCircle2,
  Sparkles,
  Printer,
  X,
  CreditCard,
  Building,
  Check,
  Calculator,
  UserPlus,
} from "lucide-react";

export function ExpensesClient({ initialData }: { initialData: ExpensesPayload }) {
  const [data, setData] = useState<ExpensesPayload>(initialData);
  const [activeTab, setActiveTab] = useState<"payroll" | "opex" | "misc" | "rental">("payroll");
  const [isPending, startTransition] = useTransition();

  // Print Payslip Modal State
  const [selectedPayslip, setSelectedPayslip] = useState<StaffPayslip | null>(null);

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

  async function handleAddStaffPayroll(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const empName = (form.elements.namedItem("emp_name") as HTMLInputElement)?.value.trim();
    const baseSal = staffFormType === "monthly" 
      ? parseFloat((form.elements.namedItem("base_salary") as HTMLInputElement)?.value || "12000")
      : daysWorked * dailyRate;
    const diligence = parseFloat((form.elements.namedItem("diligence") as HTMLInputElement)?.value || "0");
    const ot = parseFloat((form.elements.namedItem("ot") as HTMLInputElement)?.value || "0");
    const sso = staffFormType === "monthly" ? 600 : 0;
    const net = baseSal + diligence + ot - sso;

    if (!empName) {
      toast.error("กรุณาระบุชื่อพนักงาน");
      return;
    }

    const newPayslip: StaffPayslip = {
      employeeName: empName,
      month: "09/2026",
      employmentType: staffFormType,
      dailyWage: staffFormType === "probation_daily" ? dailyRate : undefined,
      daysWorked: staffFormType === "probation_daily" ? daysWorked : undefined,
      baseSalary: baseSal,
      diligence,
      ot,
      commission: 0,
      wht: 0,
      ssoDeduction: sso,
      otherDeductions: 0,
      netPay: net,
      payMethod: "บัญชีร้าน (โอน)",
      employeeRole: staffFormType === "probation_daily" ? "พนักงานทดลองงาน / หน้าร้าน" : "พนักงานประจำ",
    };

    setData((prev) => ({
      ...prev,
      payslips: [newPayslip, ...prev.payslips.filter((p) => p.employeeName !== empName)],
      totalPayroll: prev.totalPayroll + net,
    }));

    toast.success(`เพิ่มตารางเงินเดือนของ ${empName} เรียบร้อยแล้ว`);
    setShowAddStaffModal(false);
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
            จัดการเงินเดือนพนักงานประจำ, ค่าจ้างทดลองงานรายวัน (350฿/วัน), สลิปเงินเดือน A4, รายการหักภาษี และค่าใช้จ่ายร้าน
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowAddStaffModal(true)}
            className="bg-teal-400 font-bold hover:bg-teal-300 text-slate-950 text-xs gap-1.5 shadow-sm"
          >
            <UserPlus className="h-4 w-4" /> + กำหนดค่าแรงพนักงาน / ทดลองงาน
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
              <span className="text-xs font-semibold text-slate-500">ยอดเงินเดือนพนักงานรวม</span>
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
          เงินเดือนพนักงาน ({data.payslips.length})
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

      {/* ── TAB 1: STAFF PAYROLL CLEARANCE & PROBATION ── */}
      {activeTab === "payroll" && (
        <div className="space-y-6">
          {/* Payday Clearance Alert Box */}
          <div className="rounded-2xl border border-teal-700/60 bg-gradient-to-r from-teal-950 to-slate-900 p-6 text-white shadow-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-400 p-2.5 text-slate-950">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-300">
                    <Sparkles className="h-3.5 w-3.5" /> โครงสร้างพนักงานร้าน SneakerCare (พนักงานประจำ & ทดลองงาน)
                  </div>
                  <h3 className="text-xl font-black text-white">
                    สรุปยอดจ่ายค่าแรง & เงินเดือนรวม: ฿{data.totalPayroll.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setShowAddStaffModal(true)}
                  className="bg-white/10 hover:bg-white/20 text-white text-xs font-bold gap-1.5"
                >
                  <Calculator className="h-3.5 w-3.5" /> คำนวณค่าแรงทดลองงาน (350฿/วัน)
                </Button>
              </div>
            </div>

            {/* Quick Employee Summary Grid */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 pt-2">
              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur-xs space-y-1">
                <div className="text-xs text-teal-200 flex items-center justify-between">
                  <span>1. น.ส.สุทธินันท์ นนทจันทร์ (สุ)</span>
                  <Badge className="bg-teal-600 text-white text-[10px]">พนักงานประจำ</Badge>
                </div>
                <div className="text-lg font-black text-teal-300">฿11,900.00</div>
                <div className="text-[10px] text-teal-200/80">ฐาน 12,000 + เบี้ยขยัน 500 − ปกส. 600</div>
              </div>

              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur-xs space-y-1">
                <div className="text-xs text-teal-200 flex items-center justify-between">
                  <span>2. นายธีรภัทร ทาแผ (เจ)</span>
                  <Badge className="bg-indigo-600 text-white text-[10px]">พนักงานประจำ</Badge>
                </div>
                <div className="text-lg font-black text-teal-300">฿12,575.00</div>
                <div className="text-[10px] text-teal-200/80">ฐาน 12,000 + เบี้ยขยัน 500 + OT 675 − ปกส. 600</div>
              </div>

              <div className="rounded-xl bg-white/10 p-3.5 backdrop-blur-xs space-y-1">
                <div className="text-xs text-teal-200 flex items-center justify-between">
                  <span>3. มิ้ว (พนักงานใหม่/ทดลองงาน)</span>
                  <Badge className="bg-amber-500 text-slate-950 font-bold text-[10px]">ทดลองงาน 350฿/วัน</Badge>
                </div>
                <div className="text-lg font-black text-amber-300">฿9,100.00</div>
                <div className="text-[10px] text-teal-200/80">ทำงาน 26 วัน @ 350 ฿/วัน (ไม่หัก ปกส.)</div>
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
                        {p.diligence > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">เบี้ยขยัน:</span>
                            <span className="font-mono text-emerald-600">+฿{p.diligence.toLocaleString()}</span>
                          </div>
                        )}
                        {p.ot > 0 && (
                          <div className="flex justify-between">
                            <span className="text-slate-600">ค่าล่วงเวลา (OT):</span>
                            <span className="font-mono text-emerald-600">+฿{p.ot.toLocaleString()}</span>
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
                            <span className="text-slate-600">หักภาษี ณ ที่จ่าย:</span>
                            <span className="font-mono text-rose-600">-฿{p.wht.toLocaleString()}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ยอดรับสุทธิ (Net Pay) */}
                    <div className="rounded-xl bg-teal-900 p-3.5 text-white flex items-center justify-between">
                      <div>
                        <span className="text-[11px] text-teal-200 block">ยอดจ่ายสุทธิ (Net Pay)</span>
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

                {/* Print Payslip Trigger Button */}
                <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedPayslip(p)}
                    className="text-xs gap-1.5 border-teal-600 text-teal-800 hover:bg-teal-50 font-bold"
                  >
                    <Printer className="h-3.5 w-3.5" /> ออกสลิปเงินเดือน (Payslip)
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

      {/* ── ADD / CONFIGURE STAFF MODAL ── */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-teal-700" />
                กำหนดค่าแรง & รูปแบบการจ้างงาน
              </h3>
              <button onClick={() => setShowAddStaffModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddStaffPayroll} className="space-y-4 text-xs">
              <div className="space-y-1">
                <Label className="font-semibold">ชื่อ-นามสกุล หรือชื่อเล่นพนักงาน</Label>
                <Input name="emp_name" placeholder="เช่น มิ้ว (ทดลองงาน) หรือ สุ" defaultValue="มิ้ว" required className="h-9" />
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

              {staffFormType === "probation_daily" ? (
                <div className="space-y-3 rounded-xl bg-amber-50/70 p-3.5 border border-amber-200">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="font-semibold">ค่าจ้างต่อวัน (บาท)</Label>
                      <Input
                        type="number"
                        value={dailyRate}
                        onChange={(e) => setDailyRate(parseFloat(e.target.value) || 0)}
                        className="h-8 font-mono bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="font-semibold">จำนวนวันที่มาทำ (วัน)</Label>
                      <Input
                        type="number"
                        value={daysWorked}
                        onChange={(e) => setDaysWorked(parseFloat(e.target.value) || 0)}
                        className="h-8 font-mono bg-white"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-1 text-xs font-bold text-amber-950">
                    <span>รวมค่าจ้างพื้นฐาน:</span>
                    <span className="font-mono text-sm">฿{(dailyRate * daysWorked).toLocaleString()} บาท</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="font-semibold">เงินเดือนพื้นฐาน (บาท)</Label>
                  <Input name="base_salary" type="number" defaultValue="12000" className="h-9 font-mono" />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-semibold">เบี้ยขยัน (ถ้ามี)</Label>
                  <Input name="diligence" type="number" defaultValue="0" className="h-9 font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="font-semibold">ค่าล่วงเวลา OT (ถ้ามี)</Label>
                  <Input name="ot" type="number" defaultValue="0" className="h-9 font-mono" />
                </div>
              </div>

              <Button type="submit" className="w-full bg-teal-800 hover:bg-teal-900 text-white font-bold h-9">
                บันทึกโครงสร้างเงินเดือน
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
                          -฿{selectedPayslip.ssoDeduction.toLocaleString()}
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
