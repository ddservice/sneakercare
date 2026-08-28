"use client";

import { useState, useTransition } from "react";
import { addExpense, deleteExpense, type ExpenseActionState } from "@/app/actions/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";

export type ExpenseItem = {
  id: string;
  category: string;
  title: string;
  amount: number;
  expense_date: string;
  note: string | null;
};

const CATEGORIES = [
  { id: "rent", label: "ค่าเช่าห้อง / ร้าน (Rent)" },
  { id: "utilities", label: "ค่าน้ำ / ค่าไฟ / เน็ต (Utilities)" },
  { id: "supplies", label: "อุปกรณ์ & บรรจุภัณฑ์ (Supplies)" },
  { id: "marketing", label: "การตลาด & โฆษณา (Marketing)" },
  { id: "maintenance", label: "ซ่อมบำรุง / ปรับปรุง (Maintenance)" },
  { id: "other", label: "อื่นๆ (Other)" },
];

export function ExpensesClient({ initialExpenses }: { initialExpenses: ExpenseItem[] }) {
  const [expenses, setExpenses] = useState<ExpenseItem[]>(initialExpenses);
  const [activeTab, setActiveTab] = useState<"opex" | "payroll">("opex");
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [isPending, startTransition] = useTransition();

  // Mock staff list for payroll simulation
  const [staffList] = useState([
    { id: "st1", name: "สมชาย พนักงานหน้าร้าน", role: "พนักงานบริการ", baseSalary: 12000, commissionPerShoe: 20, shoesDone: 65 },
    { id: "st2", name: "สมศรี ช่างซ่อมรองเท้า", role: "ช่างซ่อม/ทำสี", baseSalary: 15000, commissionPerShoe: 30, shoesDone: 42 },
  ]);

  // Filter expenses by selected month
  const filteredExpenses = expenses.filter((e) => e.expense_date.startsWith(selectedMonth));
  const totalOpex = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Payroll calculation
  const totalBaseSalary = staffList.reduce((sum, s) => sum + s.baseSalary, 0);
  const totalCommission = staffList.reduce((sum, s) => sum + (s.commissionPerShoe * s.shoesDone), 0);
  const totalGrossPayroll = totalBaseSalary + totalCommission;
  const ssoEmployee = staffList.reduce((sum, s) => sum + Math.min(15000, s.baseSalary) * 0.05, 0);
  const ssoEmployer = ssoEmployee; // 5% matching
  const totalPayrollCost = totalGrossPayroll + ssoEmployer;

  async function handleAddExpense(formData: FormData) {
    startTransition(async () => {
      const res = await addExpense(undefined, formData);
      if (res?.error) {
        toast.error(res.error);
      } else if (res?.success) {
        toast.success("บันทึกค่าใช้จ่ายสำเร็จ");
        const newExpense: ExpenseItem = {
          id: `exp-${Date.now()}`,
          category: String(formData.get("category") ?? "other"),
          title: String(formData.get("title") ?? ""),
          amount: Number(formData.get("amount") ?? 0),
          expense_date: String(formData.get("expense_date") ?? new Date().toISOString().slice(0, 10)),
          note: String(formData.get("note") ?? ""),
        };
        setExpenses([newExpense, ...expenses]);
      }
    });
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm("คุณแน่ใจหรือไม่ว่าต้องการลบรายการนี้?")) return;
    try {
      await deleteExpense(id);
      toast.success("ลบรายการสำเร็จ");
      setExpenses(expenses.filter((e) => e.id !== id));
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
            Opex & Payroll Management
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ค่าใช้จ่าย & พนักงาน</h2>
          <p className="text-sm text-teal-100/80">
            บันทึกค่าใช้จ่ายดำเนินการ (Opex), ค่าเช่าร้าน, ค่าน้ำไฟ, ค่าแรงพนักงาน และคำนวณประกันสังคม (SSO)
          </p>
        </div>

        {/* Month selector */}
        <div className="flex items-center gap-2 rounded-xl bg-white/10 p-2 backdrop-blur-sm border border-white/10">
          <Calendar className="h-4 w-4 text-teal-300 ml-2" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent text-white text-sm font-semibold focus:outline-none pr-2"
          />
        </div>
      </div>

      {/* ── Sub Tabs ── */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab("opex")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "opex"
              ? "bg-teal-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Building2 className="h-4 w-4" /> ค่าใช้จ่ายร้าน (Opex) ({totalOpex.toLocaleString()} ฿)
        </button>
        <button
          onClick={() => setActiveTab("payroll")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all ${
            activeTab === "payroll"
              ? "bg-teal-600 text-white shadow-xs"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          }`}
        >
          <Users className="h-4 w-4" /> เงินเดือน & ประกันสังคม ({totalPayrollCost.toLocaleString()} ฿)
        </button>
      </div>

      {/* ── TAB 1: OPEX EXPENSES ── */}
      {activeTab === "opex" && (
        <div className="grid gap-8 lg:grid-cols-12">
          {/* Add Expense Form (5 cols) */}
          <div className="lg:col-span-5">
            <Card className="border-slate-200 shadow-xs dark:border-slate-800">
              <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100 dark:border-slate-800/60">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Plus className="h-4 w-4 text-teal-600" />
                  บันทึกค่าใช้จ่ายใหม่
                </CardTitle>
                <CardDescription>เพิ่มรายการค่าใช้จ่ายประจำเดือน</CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <form action={handleAddExpense} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="category" className="text-xs font-semibold">
                      หมวดหมู่ค่าใช้จ่าย <span className="text-rose-500">*</span>
                    </Label>
                    <select
                      id="category"
                      name="category"
                      required
                      className="w-full rounded-md border border-slate-200 bg-white p-2 text-sm dark:border-slate-800 dark:bg-slate-900"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="title" className="text-xs font-semibold">
                      ชื่อรายการ / รายละเอียด <span className="text-rose-500">*</span>
                    </Label>
                    <Input id="title" name="title" placeholder="เช่น ค่าเช่าห้องเดือน ส.ค., ค่าไฟ" required />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="amount" className="text-xs font-semibold">
                        จำนวนเงิน (บาท) <span className="text-rose-500">*</span>
                      </Label>
                      <Input id="amount" name="amount" type="number" step="0.01" min="1" placeholder="0.00" required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="expense_date" className="text-xs font-semibold">
                        วันที่จ่าย
                      </Label>
                      <Input
                        id="expense_date"
                        name="expense_date"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="note" className="text-xs font-semibold">
                      หมายเหตุ (ถ้ามี)
                    </Label>
                    <Input id="note" name="note" placeholder="เลขที่ใบเสร็จ หรือรายละเอียดเพิ่มเติม" />
                  </div>

                  <Button
                    type="submit"
                    disabled={isPending}
                    className="w-full bg-teal-600 font-bold hover:bg-teal-700 text-white mt-2"
                  >
                    {isPending ? "กำลังบันทึก..." : "บันทึกค่าใช้จ่าย"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          {/* Expenses List Table (7 cols) */}
          <div className="lg:col-span-7">
            <Card className="border-slate-200 shadow-xs dark:border-slate-800">
              <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold">
                    รายการค่าใช้จ่ายประจำเดือน {selectedMonth}
                  </CardTitle>
                  <CardDescription>รวมทั้งหมด {filteredExpenses.length} รายการ</CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-semibold">ยอดรวม Opex</div>
                  <div className="text-lg font-bold text-rose-600">
                    {totalOpex.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                      <tr>
                        <th className="px-4 py-3">วันที่</th>
                        <th className="px-4 py-3">หมวดหมู่</th>
                        <th className="px-4 py-3">รายการ</th>
                        <th className="px-4 py-3 text-right">จำนวนเงิน</th>
                        <th className="px-4 py-3 text-center">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredExpenses.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-sm text-slate-400">
                            ยังไม่มีการบันทึกค่าใช้จ่ายในเดือนนี้
                          </td>
                        </tr>
                      ) : (
                        filteredExpenses.map((exp) => (
                          <tr key={exp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                            <td className="px-4 py-3 font-mono text-xs text-slate-500">{exp.expense_date}</td>
                            <td className="px-4 py-3 text-xs">
                              <Badge variant="outline" className="text-[10px]">
                                {CATEGORIES.find((c) => c.id === exp.category)?.label.split(" ")[0] || exp.category}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">
                              {exp.title}
                              {exp.note && <div className="text-[11px] text-slate-400">{exp.note}</div>}
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-rose-600">
                              {exp.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDeleteExpense(exp.id)}
                                className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
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
          </div>
        </div>
      )}

      {/* ── TAB 2: PAYROLL & SOCIAL SECURITY ── */}
      {activeTab === "payroll" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="border-slate-200 shadow-xs dark:border-slate-800">
              <CardContent className="p-5">
                <span className="text-xs font-semibold text-slate-500">เงินเดือนฐาน + คอมมิชชั่น</span>
                <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                  {totalGrossPayroll.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-xs dark:border-slate-800">
              <CardContent className="p-5">
                <span className="text-xs font-semibold text-slate-500">ประกันสังคมสมทบร้าน (5%)</span>
                <div className="text-2xl font-bold text-amber-600 mt-1">
                  {ssoEmployer.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                </div>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-xs dark:border-slate-800">
              <CardContent className="p-5">
                <span className="text-xs font-semibold text-slate-500">รวมภาระค่าแรงร้านทั้งหมด</span>
                <div className="text-2xl font-bold text-teal-700 dark:text-teal-400 mt-1">
                  {totalPayrollCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ฿
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-slate-200 shadow-xs dark:border-slate-800">
            <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
              <CardTitle className="text-base font-bold">ตารางคำนวณค่าตอบแทนพนักงานรายเดือน</CardTitle>
              <CardDescription>คำนวณเงินเดือน ค่าคอมมิชชั่นตามจำนวนคู่ที่ทำ และหักประกันสังคม</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase text-slate-500 dark:border-slate-800 dark:bg-slate-900/50">
                    <tr>
                      <th className="px-4 py-3">พนักงาน</th>
                      <th className="px-4 py-3">ตำแหน่ง</th>
                      <th className="px-4 py-3 text-right">เงินเดือนฐาน</th>
                      <th className="px-4 py-3 text-right">คู่ที่ทำ / คอมมิชชั่น</th>
                      <th className="px-4 py-3 text-right">ประกันสังคม (ลูกจ้าง 5%)</th>
                      <th className="px-4 py-3 text-right">สุทธิที่จ่ายพนักงาน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {staffList.map((st) => {
                      const comm = st.commissionPerShoe * st.shoesDone;
                      const gross = st.baseSalary + comm;
                      const sso = Math.min(15000, st.baseSalary) * 0.05;
                      const netPay = gross - sso;
                      return (
                        <tr key={st.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/40">
                          <td className="px-4 py-3 font-semibold text-slate-800 dark:text-slate-200">{st.name}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{st.role}</td>
                          <td className="px-4 py-3 text-right font-mono">{st.baseSalary.toLocaleString()} ฿</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-teal-700 dark:text-teal-400">
                            {st.shoesDone} คู่ (+{comm.toLocaleString()} ฿)
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-amber-600">-{sso.toLocaleString()} ฿</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                            {netPay.toLocaleString()} ฿
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
