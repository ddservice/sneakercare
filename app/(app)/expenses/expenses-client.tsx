"use client";

import { useState, useMemo, useTransition } from "react";
import {
  fetchAllExpensesData,
  addExpense,
  deleteExpense,
  saveStaffPayrollAdjustment,
  saveStaffProfileInfo,
  createStaffMember,
  type ExpensesPayload,
  type StaffPayslip,
  type RealExpenseRecord,
} from "@/app/actions/expenses";
import {
  EXPENSE_CATEGORIES,
  CATEGORY_LIST,
  classifyExpenseCategory,
  type ExpenseCategoryKey,
} from "@/lib/expense-categories";
import { thaiBahtText } from "@/lib/bahttext";
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
  CheckCircle2,
  Sparkles,
  Printer,
  X,
  CreditCard,
  UserPlus,
  Save,
  TrendingUp,
  Percent,
  IdCard,
  Edit,
  ShieldCheck,
  Building,
  Check,
  Filter,
  Layers,
  PieChart,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

export const AVAILABLE_MONTHS = [
  { value: "08/2026", iso: "2026-08", label: "สิงหาคม 2569 (08/2026) — งวดล่าสุด", monthName: "สิงหาคม 2569" },
  { value: "07/2026", iso: "2026-07", label: "กรกฎาคม 2569 (07/2026)", monthName: "กรกฎาคม 2569" },
  { value: "06/2026", iso: "2026-06", label: "มิถุนายน 2569 (06/2026)", monthName: "มิถุนายน 2569" },
  { value: "05/2026", iso: "2026-05", label: "พฤษภาคม 2569 (05/2026)", monthName: "พฤษภาคม 2569" },
  { value: "04/2026", iso: "2026-04", label: "เมษายน 2569 (04/2026)", monthName: "เมษายน 2569" },
  { value: "03/2026", iso: "2026-03", label: "มีนาคม 2569 (03/2026)", monthName: "มีนาคม 2569" },
  { value: "02/2026", iso: "2026-02", label: "กุมภาพันธ์ 2569 (02/2026)", monthName: "กุมภาพันธ์ 2569" },
  { value: "01/2026", iso: "2026-01", label: "มกราคม 2569 (01/2026)", monthName: "มกราคม 2569" },
  { value: "12/2025", iso: "2025-12", label: "ธันวาคม 2568 (12/2025)", monthName: "ธันวาคม 2568" },
  { value: "11/2025", iso: "2025-11", label: "พฤศจิกายน 2568 (11/2025)", monthName: "พฤศจิกายน 2568" },
  { value: "all", iso: "all", label: "📊 ภาพรวมสะสมทุกงวด (All Time: 10 เดือน)", monthName: "ภาพรวมสะสมทั้งหมด (10 เดือน)" },
];

export function ExpensesClient({
  initialData,
  shopProfile,
}: {
  initialData: ExpensesPayload;
  /** ข้อมูลบริษัทจริงจากหน้า /settings — ใช้พิมพ์หัวเอกสารสลิปเงินเดือน ห้าม hardcode ทับ */
  shopProfile?: { name: string; address: string; taxId: string; phone: string };
}) {
  const [data, setData] = useState<ExpensesPayload>(initialData);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    if (initialData.timeRange && initialData.timeRange.includes("/")) return initialData.timeRange;
    if (initialData.timeRange === "all") return "all";
    return "08/2026";
  });
  const [activeTab, setActiveTab] = useState<"overview" | "payroll" | "opex">("overview");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<ExpenseCategoryKey | "all">("all");
  const [isPending, startTransition] = useTransition();

  // Print Payslip Modal State
  const [selectedPayslip, setSelectedPayslip] = useState<StaffPayslip | null>(null);

  // Edit Staff Profile Modal State
  const [editingProfileStaff, setEditingProfileStaff] = useState<StaffPayslip | null>(null);
  const [editFullName, setEditFullName] = useState("");
  const [editNickname, setEditNickname] = useState("");
  const [editIdCardNo, setEditIdCardNo] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editAccountNo, setEditAccountNo] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editEmpType, setEditEmpType] = useState<"monthly" | "probation_daily">("monthly");
  const [editSalary, setEditSalary] = useState<number>(12000);
  const [editDailyRate, setEditDailyRate] = useState<number>(350);

  // New Staff Modal State
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState("");
  const [newStaffNickname, setNewStaffNickname] = useState("");
  const [newStaffIdCard, setNewStaffIdCard] = useState("");
  const [newStaffBank, setNewStaffBank] = useState("กสิกรไทย (KBANK)");
  const [newStaffAccount, setNewStaffAccount] = useState("");
  const [newStaffPosition, setNewStaffPosition] = useState("ช่างสปารองเท้า");
  const [newStaffType, setNewStaffType] = useState<"monthly" | "probation_daily">("probation_daily");
  const [newStaffSalary, setNewStaffSalary] = useState<number>(350);

  // Add Expense Modal State
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<ExpenseCategoryKey>("facility_utilities");
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expPayMethod, setExpPayMethod] = useState("บัญชีร้าน (โอน)");
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));

  // Interactive Live Values State for Staff (Keyed by employeeName)
  const [staffDrafts, setStaffDrafts] = useState<
    Record<
      string,
      {
        diligence: number;
        ot: number;
        commPct: number;
        daysWorked: number;
        otherDeductions: number;
      }
    >
  >(() => {
    const initial: Record<string, any> = {};
    initialData.payslips.forEach((p) => {
      initial[p.employeeName] = {
        diligence: p.diligence,
        ot: p.ot,
        commPct: p.commPct || 0,
        daysWorked: p.daysWorked || 8,
        otherDeductions: p.otherDeductions || 0,
      };
    });
    return initial;
  });

  // Calculate 6-Category Aggregation
  const categoryBreakdown = useMemo(() => {
    const map: Record<ExpenseCategoryKey, { total: number; count: number }> = {
      payroll: { total: data.totalPayroll, count: data.payslips.length },
      facility_utilities: { total: 0, count: 0 },
      supplies_cogs: { total: 0, count: 0 },
      marketing: { total: 0, count: 0 },
      tax_professional: { total: 0, count: 0 },
      admin_general: { total: 0, count: 0 },
    };

    (data.opexList || []).forEach((item) => {
      const standardCat = classifyExpenseCategory(item.category, item.name);
      if (standardCat !== "payroll") {
        map[standardCat].total += item.amount;
        map[standardCat].count += 1;
      }
    });

    const net = data.netExpenses || 1;
    return CATEGORY_LIST.map((cat) => {
      const stats = map[cat.key];
      const pct = (stats.total / net) * 100;
      return {
        ...cat,
        total: stats.total,
        count: stats.count,
        percentage: Math.round(pct * 10) / 10,
      };
    });
  }, [data]);

  // Filter OPEX items by selected category filter
  const filteredOpexList = useMemo(() => {
    if (selectedCategoryFilter === "all") return data.opexList;
    return data.opexList.filter((item) => {
      const itemCat = classifyExpenseCategory(item.category, item.name);
      return itemCat === selectedCategoryFilter;
    });
  }, [data.opexList, selectedCategoryFilter]);

  // Current Month Meta
  const currentMonthMeta = useMemo(() => {
    return AVAILABLE_MONTHS.find((m) => m.value === selectedMonth) || AVAILABLE_MONTHS[0];
  }, [selectedMonth]);

  const currentMonthIndex = useMemo(() => {
    return AVAILABLE_MONTHS.findIndex((m) => m.value === selectedMonth);
  }, [selectedMonth]);

  // Month Switch Handler
  function handleSelectMonth(monthVal: string) {
    setSelectedMonth(monthVal);
    startTransition(async () => {
      const updated = await fetchAllExpensesData(monthVal);
      setData(updated);
      const newDrafts: Record<string, any> = {};
      updated.payslips.forEach((p) => {
        newDrafts[p.employeeName] = {
          diligence: p.diligence,
          ot: p.ot,
          commPct: p.commPct || 0,
          daysWorked: p.daysWorked || 8,
          otherDeductions: p.otherDeductions || 0,
        };
      });
      setStaffDrafts(newDrafts);
      toast.success(`เปลี่ยนเป็นงวด: ${AVAILABLE_MONTHS.find((m) => m.value === monthVal)?.monthName || monthVal}`);
    });
  }

  function handleShiftMonth(direction: number) {
    const nextIdx = currentMonthIndex + direction;
    if (nextIdx >= 0 && nextIdx < AVAILABLE_MONTHS.length) {
      handleSelectMonth(AVAILABLE_MONTHS[nextIdx].value);
    }
  }

  function updateStaffDraft(
    empName: string,
    field: "diligence" | "ot" | "commPct" | "daysWorked" | "otherDeductions",
    value: number
  ) {
    setStaffDrafts((prev) => {
      const current = prev[empName] || {
        diligence: 0,
        ot: 0,
        commPct: 0,
        daysWorked: 8,
        otherDeductions: 0,
      };
      const next = { ...current, [field]: value };

      setData((prevData) => {
        const updatedPayslips = prevData.payslips.map((p) => {
          if (p.employeeName !== empName) return p;

          let base = p.baseSalary;
          if (p.employmentType === "probation_daily") {
            const daily = p.dailyWage || 350;
            base = daily * next.daysWorked;
          }

          const comm = Math.round((prevData.totalMonthlySales * next.commPct) / 100);
          const wht = Math.round(comm * 0.03);
          const sso = p.employmentType === "monthly" ? 600 : 0;
          const net = base + next.diligence + next.ot + comm - sso - wht - next.otherDeductions;

          return {
            ...p,
            baseSalary: base,
            daysWorked: next.daysWorked,
            diligence: next.diligence,
            ot: next.ot,
            commPct: next.commPct,
            commission: comm,
            wht,
            ssoDeduction: sso,
            otherDeductions: next.otherDeductions,
            netPay: net,
          };
        });

        const newPayrollTotal = updatedPayslips.reduce((sum, item) => sum + item.netPay, 0);

        return {
          ...prevData,
          payslips: updatedPayslips,
          totalPayroll: newPayrollTotal,
          netExpenses: prevData.totalOpex + newPayrollTotal,
        };
      });

      return { ...prev, [empName]: next };
    });
  }

  function handleSaveStaffAdjustment(p: StaffPayslip) {
    startTransition(async () => {
      const res = await saveStaffPayrollAdjustment({
        month: p.month,
        employeeName: p.employeeName,
        employmentType: p.employmentType,
        baseSalary: p.baseSalary,
        diligence: p.diligence,
        ot: p.ot,
        commPct: p.commPct || 0,
        commission: p.commission,
        wht: p.wht,
        ssoDeduction: p.ssoDeduction,
        otherDeductions: p.otherDeductions,
        netPay: p.netPay,
        payMethod: p.payMethod,
      });

      if (res.success) {
        toast.success(`บันทึกข้อมูลเงินเดือนของ ${p.employeeName} สำเร็จแล้ว`);
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการบันทึก");
      }
    });
  }

  // Open Edit Profile Modal
  function handleOpenEditProfile(p: StaffPayslip) {
    setEditingProfileStaff(p);
    setEditFullName(p.employeeName);
    setEditNickname(p.nickname || "");
    setEditIdCardNo(p.idCardNo || "");
    setEditBankName(p.bankName || "กสิกรไทย (KBANK)");
    setEditAccountNo(p.accountNo || "");
    setEditRole(p.employeeRole || (p.employmentType === "monthly" ? "พนักงานประจำ" : "พนักงานทดลองงาน"));
    setEditEmpType(p.employmentType);
    setEditSalary(p.baseSalary || 12000);
    setEditDailyRate(p.dailyWage || 350);
  }

  // Save Edit Profile Modal
  function handleSaveStaffProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProfileStaff) return;

    startTransition(async () => {
      const res = await saveStaffProfileInfo({
        employeeKeyName: editingProfileStaff.employeeName,
        fullName: editFullName.trim(),
        nickname: editNickname.trim(),
        idCardNo: editIdCardNo.trim(),
        bankName: editBankName.trim(),
        accountNo: editAccountNo.trim(),
        employeeRole: editRole.trim(),
        employmentType: editEmpType,
        baseSalary: editEmpType === "monthly" ? editSalary : editDailyRate * (editingProfileStaff.daysWorked || 8),
        dailyWage: editEmpType === "probation_daily" ? editDailyRate : undefined,
        daysWorked: editingProfileStaff.daysWorked || 8,
      });

      if (res.success) {
        toast.success(`อัปเดตข้อมูลและประเภทพนักงาน "${editFullName}" เรียบร้อยแล้ว`);
        setData((prev) => ({
          ...prev,
          payslips: prev.payslips.map((p) =>
            p.employeeName === editingProfileStaff.employeeName
              ? {
                  ...p,
                  employeeName: editFullName.trim(),
                  nickname: editNickname.trim(),
                  idCardNo: editIdCardNo.trim(),
                  bankName: editBankName.trim(),
                  accountNo: editAccountNo.trim(),
                  employeeRole: editRole.trim(),
                  employmentType: editEmpType,
                  baseSalary: editEmpType === "monthly" ? editSalary : editDailyRate * (p.daysWorked || 8),
                  dailyWage: editEmpType === "probation_daily" ? editDailyRate : undefined,
                  ssoDeduction: editEmpType === "monthly" ? 600 : 0,
                  netPay:
                    (editEmpType === "monthly" ? editSalary : editDailyRate * (p.daysWorked || 8)) +
                    p.diligence +
                    p.ot +
                    p.commission -
                    (editEmpType === "monthly" ? 600 : 0) -
                    p.wht -
                    p.otherDeductions,
                }
              : p
          ),
        }));
        setEditingProfileStaff(null);
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการอัปเดต");
      }
    });
  }

  // Create Staff Member
  function handleCreateStaff(e: React.FormEvent) {
    e.preventDefault();
    if (!newStaffName.trim()) {
      toast.error("กรุณาระบุชื่อพนักงาน");
      return;
    }

    startTransition(async () => {
      const res = await createStaffMember({
        fullName: newStaffName.trim(),
        nickname: newStaffNickname.trim() || newStaffName.trim(),
        idCardNo: newStaffIdCard.trim() || "ยังไม่ได้ระบุ",
        bankName: newStaffBank.trim(),
        accountNo: newStaffAccount.trim() || "-",
        position: newStaffPosition.trim(),
        employmentType: newStaffType,
        salary: newStaffType === "monthly" ? newStaffSalary : newStaffSalary,
      });

      if (res.success) {
        toast.success(`เพิ่มพนักงานใหม่ "${newStaffName}" สำเร็จเรียบร้อย`);
        setShowAddStaffModal(false);
        const updated = await fetchAllExpensesData(selectedMonth);
        setData(updated);
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการสร้างพนักงาน");
      }
    });
  }

  // Create Expense Handler
  function handleCreateExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!expTitle.trim()) {
      toast.error("กรุณาระบุชื่อรายการค่าใช้จ่าย");
      return;
    }
    if (expAmount <= 0) {
      toast.error("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }

    const categoryMeta = EXPENSE_CATEGORIES[expCategory];
    const categoryName = categoryMeta ? categoryMeta.shortLabel : "ค่าดำเนินการ";

    startTransition(async () => {
      const formData = new FormData();
      formData.set("title", expTitle.trim());
      formData.set("category", categoryName);
      formData.set("amount", String(expAmount));
      formData.set("pay_method", expPayMethod);
      formData.set("expense_date", expDate);

      const res = await addExpense(undefined, formData);
      if (res.success) {
        toast.success(`บันทึกค่าใช้จ่าย "${expTitle}" สำเร็จเรียบร้อย`);
        setShowAddExpenseModal(false);
        setExpTitle("");
        setExpAmount(0);
        const updated = await fetchAllExpensesData(selectedMonth);
        setData(updated);
      } else {
        toast.error(res.error || "เกิดข้อผิดพลาดในการบันทึก");
      }
    });
  }

  // Delete Expense Handler
  function handleDeleteExpense(id: string | number, name: string) {
    if (!confirm(`คุณต้องการลบรายการค่าใช้จ่าย "${name}" ใช่หรือไม่?`)) return;

    startTransition(async () => {
      try {
        await deleteExpense(id);
        toast.success(`ลบรายการ "${name}" เรียบร้อยแล้ว`);
        const updated = await fetchAllExpensesData(selectedMonth);
        setData(updated);
      } catch (err: any) {
        toast.error(err.message || "ไม่สามารถลบรายการได้");
      }
    });
  }

  return (
    <div className={`space-y-8 transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
      {/* ── Page Header Banner ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-teal-800 via-teal-900 to-slate-900 p-6 text-white shadow-md print:hidden">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-500/20 px-3 py-1 text-xs font-semibold text-teal-200 ring-1 ring-teal-400/30">
            <Wallet className="h-3.5 w-3.5" />
            SneakerCare Standard Expense & Payroll Hub
          </div>
          <h2 className="text-2xl font-bold tracking-tight">ระบบบันทึกค่าใช้จ่าย & จัดการเงินเดือนมาตรฐาน</h2>
          <p className="text-xs sm:text-sm text-teal-100/80">
            โครงสร้างค่าใช้จ่าย 6 หมวดหมู่มาตรฐาน ออกสลิปเงินเดือนทางการสำหรับธุรกรรมธนาคาร และควบคุมต้นทุนครบวงจร
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => setShowAddExpenseModal(true)}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs gap-1.5 shadow-sm h-9"
          >
            <Plus className="h-4 w-4" /> บันทึกค่าใช้จ่ายใหม่
          </Button>
          <Button
            onClick={() => setShowAddStaffModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-xs h-9"
          >
            <UserPlus className="h-4 w-4" /> เพิ่มพนักงานใหม่
          </Button>
        </div>
      </div>

      {/* ── HIGH-END PROFESSIONAL ACCOUNTING MONTH SELECTOR TOOLBAR ── */}
      <Card className="border-teal-200 bg-teal-50/50 shadow-xs print:hidden">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: Month Dropdown */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-teal-800 text-white flex items-center justify-center font-bold shadow-2xs">
                  <Calendar className="h-4 w-4" />
                </div>
                <span className="text-xs font-bold text-teal-950">เลือกงวดบัญชี & เงินเดือน:</span>
              </div>

              <select
                value={selectedMonth}
                onChange={(e) => handleSelectMonth(e.target.value)}
                disabled={isPending}
                className="h-9 rounded-xl border-2 border-teal-600 bg-white px-3 text-xs font-bold text-teal-950 shadow-2xs focus:outline-none focus:ring-2 focus:ring-teal-500/20 cursor-pointer min-w-[240px]"
              >
                {AVAILABLE_MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Right: Quick Month Navigation Arrows */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending || selectedMonth === "all" || currentMonthIndex >= AVAILABLE_MONTHS.length - 2}
                onClick={() => handleShiftMonth(1)}
                className="h-8 text-xs font-semibold gap-1 bg-white border-teal-200 text-teal-900 hover:bg-teal-100"
                title="ย้อนกลับไปงวดเดือนก่อนหน้า"
              >
                <ChevronLeft className="h-4 w-4" /> เดือนก่อนหน้า
              </Button>

              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isPending || selectedMonth === "all" || currentMonthIndex <= 0}
                onClick={() => handleShiftMonth(-1)}
                className="h-8 text-xs font-semibold gap-1 bg-white border-teal-200 text-teal-900 hover:bg-teal-100"
                title="ไปยังงวดเดือนถัดไป"
              >
                เดือนถัดไป <ChevronRight className="h-4 w-4" />
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={() => handleSelectMonth("08/2026")}
                disabled={isPending || selectedMonth === "08/2026"}
                className="h-8 text-xs font-bold bg-teal-800 hover:bg-emerald-500 text-white shadow-2xs"
              >
                🎯 งวดล่าสุด (ส.ค. 69)
              </Button>

              <Button
                type="button"
                size="sm"
                variant={selectedMonth === "all" ? "default" : "outline"}
                onClick={() => handleSelectMonth("all")}
                disabled={isPending}
                className={`h-8 text-xs font-bold ${
                  selectedMonth === "all" ? "bg-emerald-500 text-white" : "bg-white text-slate-700 border-slate-300"
                }`}
              >
                🌐 รวมสะสมทุกงวด
              </Button>
            </div>
          </div>

          {/* Active Period Status Bar */}
          <div className="flex items-center justify-between text-xs border-t border-teal-200/60 pt-2 font-medium text-teal-950">
            <div className="flex items-center gap-2">
              <span>📅 กำลังแสดงผลงวด:</span>
              <span className="font-extrabold text-teal-900 bg-white px-2 py-0.5 rounded-md border border-teal-200">
                {currentMonthMeta.monthName}
              </span>
              {isPending && (
                <span className="flex items-center gap-1 text-[11px] text-teal-700 font-bold animate-pulse">
                  <RefreshCw className="h-3 w-3 animate-spin" /> กำลังโหลดข้อมูล...
                </span>
              )}
            </div>
            <div className="text-slate-500 text-[11px]">
              บันทึกค่าใช้จ่าย {data.opexList.length} รายการ · พนักงาน {data.payslips.length} ท่าน
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Top Level Metric Summary Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ยอดขายบริการ (Revenue Base)</span>
              <div className="text-xl font-black text-slate-900 dark:text-slate-100 font-mono">
                ฿{data.totalMonthlySales.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-400">ฐานคำนวณค่าคอมมิชชั่น</div>
            </div>
            <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700">
              <Receipt className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-indigo-200 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ค่าแรง & เงินเดือนรวม (Payroll)</span>
              <div className="text-xl font-black text-indigo-700 font-mono">
                ฿{data.totalPayroll.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-400">พนักงาน {data.payslips.length} ท่าน</div>
            </div>
            <div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700">
              <Users className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">ค่าดำเนินการดำเนินงาน (OPEX)</span>
              <div className="text-xl font-black text-amber-700 font-mono">
                ฿{data.totalOpex.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-400">สาธารณูปโภค, ค่าเช่า, การตลาด, ฯลฯ</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-teal-300 shadow-xs bg-teal-800 text-white">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-teal-200">รวมค่าใช้จ่ายทั้งหมด (Total Expenses)</span>
              <div className="text-xl font-black text-white font-mono">
                ฿{data.netExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-teal-200">เงินเดือน + ค่าดำเนินการ 6 หมวด</div>
            </div>
            <div className="rounded-xl bg-teal-700/60 p-2.5 text-teal-100">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 6-CATEGORY VISUAL BREAKDOWN SECTION ── */}
      <Card className="border-slate-200 shadow-sm print:hidden">
        <CardHeader className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-teal-700" />
              โครงสร้างการแจกแจงค่าใช้จ่าย 6 หมวดหมู่มาตรฐาน (Expense Breakdown)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              วิเคราะห์สัดส่วนและยอดค่าใช้จ่ายที่เกิดขึ้นจริงในแต่ละประเภทธุรกิจ
            </CardDescription>
          </div>
          <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
            รวม 6 หมวด: <strong className="text-slate-900 font-mono">฿{data.netExpenses.toLocaleString()}</strong>
          </div>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* Visual Percentage Distribution Progress Bar */}
          <div className="space-y-1.5">
            <div className="h-4 w-full rounded-full bg-slate-100 flex overflow-hidden shadow-inner border border-slate-200">
              {categoryBreakdown.map((cat) => {
                if (cat.percentage <= 0) return null;
                return (
                  <div
                    key={cat.key}
                    style={{ width: `${Math.max(cat.percentage, 2)}%` }}
                    className={`${cat.colorClass.bar} transition-all duration-300 hover:opacity-80 cursor-pointer`}
                    title={`${cat.shortLabel}: ฿${cat.total.toLocaleString()} (${cat.percentage}%)`}
                    onClick={() => {
                      setSelectedCategoryFilter(cat.key);
                      if (cat.key === "payroll") setActiveTab("payroll");
                      else setActiveTab("opex");
                    }}
                  />
                );
              })}
            </div>
          </div>

          {/* 6 Category Interactive Grid Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categoryBreakdown.map((cat) => {
              const isSelected = selectedCategoryFilter === cat.key;
              return (
                <div
                  key={cat.key}
                  onClick={() => {
                    if (selectedCategoryFilter === cat.key) {
                      setSelectedCategoryFilter("all");
                    } else {
                      setSelectedCategoryFilter(cat.key);
                      if (cat.key === "payroll") setActiveTab("payroll");
                      else setActiveTab("opex");
                    }
                  }}
                  className={`rounded-xl border p-3.5 transition-all cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-teal-600 shadow-md bg-white border-teal-600"
                      : `${cat.colorClass.bg} ${cat.colorClass.border} hover:shadow-xs hover:border-slate-400`
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat.icon}</span>
                      <div>
                        <div className="font-bold text-xs text-slate-900">{cat.shortLabel}</div>
                        <div className="text-[10px] text-slate-500 font-medium line-clamp-1">
                          {cat.count} รายการ
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] font-black shrink-0 ${cat.colorClass.badge}`}>
                      {cat.percentage}%
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <div className="text-base font-black font-mono text-slate-900">
                      ฿{cat.total.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </div>
                    <span className="text-[10px] font-semibold text-teal-800 hover:underline">
                      {isSelected ? "แสดงทั้งหมด" : "ดูรายการ →"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Main Tab Navigation & Category Filter Pills ── */}
      <div className="space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
          <div className="flex items-center gap-2">
            <Button
              variant={activeTab === "overview" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveTab("overview");
                setSelectedCategoryFilter("all");
              }}
              className={`text-xs font-bold ${activeTab === "overview" ? "bg-teal-800 text-white" : "text-slate-600"}`}
            >
              <Layers className="h-3.5 w-3.5 mr-1" /> รวมค่าใช้จ่ายทั้งหมด
            </Button>
            <Button
              variant={activeTab === "payroll" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveTab("payroll");
                setSelectedCategoryFilter("payroll");
              }}
              className={`text-xs font-bold ${activeTab === "payroll" ? "bg-teal-800 text-white" : "text-slate-600"}`}
            >
              <Users className="h-3.5 w-3.5 mr-1" /> บัญชีเงินเดือนพนักงาน ({data.payslips.length})
            </Button>
            <Button
              variant={activeTab === "opex" ? "default" : "ghost"}
              size="sm"
              onClick={() => {
                setActiveTab("opex");
                if (selectedCategoryFilter === "payroll") setSelectedCategoryFilter("all");
              }}
              className={`text-xs font-bold ${activeTab === "opex" ? "bg-teal-800 text-white" : "text-slate-600"}`}
            >
              <Building2 className="h-3.5 w-3.5 mr-1" /> ค่าดำเนินการร้าน ({data.opexList.length})
            </Button>
          </div>
        </div>

        {/* Quick Filter Pill Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-2 rounded-xl border border-slate-200">
          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1 mr-1">
            <Filter className="h-3.5 w-3.5 text-slate-600" /> กรองหมวด:
          </span>
          <Button
            type="button"
            size="sm"
            variant={selectedCategoryFilter === "all" ? "default" : "outline"}
            onClick={() => setSelectedCategoryFilter("all")}
            className={`h-7 text-[11px] font-bold ${
              selectedCategoryFilter === "all" ? "bg-emerald-500 text-white" : "bg-white text-slate-700"
            }`}
          >
            🌐 ทั้งหมด ({data.opexList.length + data.payslips.length})
          </Button>

          {CATEGORY_LIST.map((cat) => (
            <Button
              key={cat.key}
              type="button"
              size="sm"
              variant={selectedCategoryFilter === cat.key ? "default" : "outline"}
              onClick={() => {
                setSelectedCategoryFilter(cat.key);
                if (cat.key === "payroll") setActiveTab("payroll");
                else if (activeTab === "payroll") setActiveTab("opex");
              }}
              className={`h-7 text-[11px] font-bold gap-1 ${
                selectedCategoryFilter === cat.key ? "bg-teal-800 text-white" : "bg-white text-slate-700"
              }`}
            >
              <span>{cat.icon}</span> {cat.shortLabel}
            </Button>
          ))}
        </div>
      </div>

      {/* ── VIEW 1: PAYROLL SECTION ── */}
      {(activeTab === "payroll" || (activeTab === "overview" && (selectedCategoryFilter === "all" || selectedCategoryFilter === "payroll"))) && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-teal-700" />
              1. หมวดค่าแรงและบัญชีเงินเดือนพนักงาน (Staff & Payroll)
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              งวด {currentMonthMeta.monthName}: <strong className="text-teal-900 font-mono">฿{data.totalPayroll.toLocaleString()}</strong>
            </span>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {data.payslips.map((p) => {
              const draft = staffDrafts[p.employeeName] || {
                diligence: p.diligence,
                ot: p.ot,
                commPct: p.commPct || 0,
                daysWorked: p.daysWorked || 8,
                otherDeductions: p.otherDeductions || 0,
              };

              const isMonthly = p.employmentType === "monthly";

              return (
                <Card
                  key={p.employeeName}
                  className={`border-2 shadow-sm transition-all overflow-hidden ${
                    isMonthly ? "border-teal-300 bg-white" : "border-amber-300 bg-white"
                  }`}
                >
                  <CardHeader className={`p-4 border-b ${isMonthly ? "bg-teal-50/60 border-teal-100" : "bg-amber-50/60 border-amber-100"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-1.5">
                          <Users className={`h-4 w-4 ${isMonthly ? "text-teal-700" : "text-amber-600"}`} />
                          {p.employeeName}
                        </CardTitle>
                        <CardDescription className="text-xs text-slate-500 font-medium">
                          {p.employeeRole || (isMonthly ? "พนักงานประจำ" : "พนักงานทดลองงาน")} · งวด: {p.month}
                        </CardDescription>
                      </div>

                      {/* Status Badge with Strict Color Toggle */}
                      <Badge
                        className={`text-[10px] font-bold shrink-0 ${
                          isMonthly
                            ? "bg-emerald-500 text-white hover:bg-emerald-600"
                            : "bg-amber-500 text-slate-950 hover:bg-amber-600"
                        }`}
                      >
                        {isMonthly ? "พนักงานประจำ" : "ทดลองงาน (350฿/วัน)"}
                      </Badge>
                    </div>

                    {/* Employee Profile Card with Edit Button */}
                    <div className="mt-2.5 rounded-lg bg-white p-2.5 border border-slate-200 shadow-2xs flex items-center justify-between text-[11px] text-slate-700">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 font-mono text-[10px] text-slate-900">
                          <IdCard className="h-3.5 w-3.5 text-teal-700 shrink-0" />
                          <span>เลขบัตร: <strong>{p.idCardNo || "ยังไม่ได้ระบุ"}</strong></span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate max-w-[190px]">
                          {p.bankName || "กสิกรไทย"}: {p.accountNo || "-"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenEditProfile(p)}
                        className="rounded-md bg-teal-50 px-2 py-1 text-teal-800 hover:bg-teal-100 text-[10px] font-bold flex items-center gap-1 border border-teal-200 shrink-0"
                        title="แก้ไขข้อมูลพนักงานและเปลี่ยนสถานะประจำ/ทดลองงาน"
                      >
                        <Edit className="h-3 w-3" /> แก้ไข
                      </button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4 text-xs">
                    {/* Base Salary or Daily Rate */}
                    {isMonthly ? (
                      <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <span className="text-slate-600 font-semibold">เงินเดือนประจำ:</span>
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          ฿{p.baseSalary.toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <div className="space-y-1.5 bg-amber-50/80 p-3 rounded-xl border border-amber-200">
                        <div className="flex justify-between items-center text-[11px] font-bold text-amber-900">
                          <span>จำนวนวันทำงานในเดือนนี้ (วัน):</span>
                          <span className="font-mono text-sm">฿{p.baseSalary.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={draft.daysWorked}
                            onChange={(e) =>
                              updateStaffDraft(p.employeeName, "daysWorked", parseFloat(e.target.value) || 0)
                            }
                            className="h-8 bg-white font-mono text-xs"
                          />
                          <span className="text-[11px] text-slate-500 shrink-0">วัน x {p.dailyWage || 350}฿</span>
                        </div>
                      </div>
                    )}

                    {/* Diligence & OT */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-emerald-700">เบี้ยขยัน (บาท):</Label>
                        <Input
                          type="number"
                          value={draft.diligence}
                          onChange={(e) =>
                            updateStaffDraft(p.employeeName, "diligence", parseFloat(e.target.value) || 0)
                          }
                          className="h-8 font-mono text-xs border-emerald-300"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px] font-bold text-emerald-700">ค่าล่วงเวลา OT (บาท):</Label>
                        <Input
                          type="number"
                          value={draft.ot}
                          onChange={(e) => updateStaffDraft(p.employeeName, "ot", parseFloat(e.target.value) || 0)}
                          className="h-8 font-mono text-xs border-emerald-300"
                        />
                      </div>
                    </div>

                    {/* Commission */}
                    <div className="space-y-1 bg-teal-50/70 p-2.5 rounded-xl border border-teal-200">
                      <div className="flex justify-between items-center text-[11px]">
                        <Label className="font-bold text-teal-900 flex items-center gap-1">
                          <Percent className="h-3 w-3 text-teal-700" /> คอมมิชชั่น (%):
                        </Label>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">+฿{p.commission.toLocaleString()}</span>
                      </div>
                      <select
                        value={draft.commPct}
                        onChange={(e) =>
                          updateStaffDraft(p.employeeName, "commPct", parseFloat(e.target.value) || 0)
                        }
                        className="w-full rounded-md border border-teal-300 bg-white p-1.5 text-xs font-semibold text-teal-900"
                      >
                        <option value="0">ไม่มีค่าคอม (0%)</option>
                        <option value="1">1% (฿{(data.totalMonthlySales * 0.01).toLocaleString()})</option>
                        <option value="1.5">1.5% (฿{(data.totalMonthlySales * 0.015).toLocaleString()})</option>
                        <option value="2">2% (฿{(data.totalMonthlySales * 0.02).toLocaleString()})</option>
                        <option value="2.5">2.5% (฿{(data.totalMonthlySales * 0.025).toLocaleString()})</option>
                        <option value="3">3% (฿{(data.totalMonthlySales * 0.03).toLocaleString()})</option>
                      </select>
                    </div>

                    {/* Deductions */}
                    <div className="space-y-1 rounded-xl bg-rose-50/50 p-2.5 border border-rose-100 text-[11px]">
                      <div className="flex justify-between text-slate-600">
                        <span>หักประกันสังคม (5%):</span>
                        <span className="font-mono font-semibold text-rose-600">
                          {p.ssoDeduction > 0 ? `-฿${p.ssoDeduction.toLocaleString()}` : "ยกเว้น"}
                        </span>
                      </div>
                      {p.wht > 0 && (
                        <div className="flex justify-between text-slate-600">
                          <span>หักภาษี ณ ที่จ่าย 3% (คอม):</span>
                          <span className="font-mono font-semibold text-rose-600">-฿{p.wht.toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-slate-600">หักอื่นๆ (ขาด/สาย):</span>
                        <Input
                          type="number"
                          value={draft.otherDeductions}
                          onChange={(e) =>
                            updateStaffDraft(p.employeeName, "otherDeductions", parseFloat(e.target.value) || 0)
                          }
                          className="h-6 w-24 font-mono text-xs text-right"
                        />
                      </div>
                    </div>

                    {/* Net Pay Box */}
                    <div className="rounded-xl bg-teal-800 p-3 text-white flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-teal-200 uppercase font-bold tracking-wider">
                          ยอดจ่ายสุทธิ (Net Pay)
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          ฿{p.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedPayslip(p)}
                          className="h-8 bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs px-2.5 gap-1"
                          title="พิมพ์สลิปเงินเดือนทางการสำหรับทำธุรกรรมธนาคาร"
                        >
                          <Printer className="h-3.5 w-3.5" /> สลิป
                        </Button>
                        <Button
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleSaveStaffAdjustment(p)}
                          className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-2.5 gap-1"
                        >
                          <Save className="h-3.5 w-3.5" /> บันทึก
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ── VIEW 2: OPEX / EXPENSES TABLE SECTION ── */}
      {(activeTab === "opex" || (activeTab === "overview" && selectedCategoryFilter !== "payroll")) && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-amber-700" />
                รายการค่าใช้จ่ายดำเนินงานร้าน ({filteredOpexList.length} รายการ)
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                {selectedCategoryFilter === "all"
                  ? `งวด ${currentMonthMeta.monthName} — แสดงรายการค่าใช้จ่ายทั้งหมด`
                  : `งวด ${currentMonthMeta.monthName} — กำลังกรอง: ${EXPENSE_CATEGORIES[selectedCategoryFilter as ExpenseCategoryKey]?.label || selectedCategoryFilter}`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => setShowAddExpenseModal(true)}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs gap-1.5 h-8 shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" /> บันทึกค่าใช้จ่ายใหม่
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 z-10">
                  <tr>
                    <th className="px-4 py-2.5 text-left">งวดเดือน</th>
                    <th className="px-3 py-2.5 text-left">หมวดหมู่มาตรฐาน</th>
                    <th className="px-3 py-2.5 text-left">ชื่อรายการค่าใช้จ่าย</th>
                    <th className="px-3 py-2.5 text-left">ช่องทางชำระ</th>
                    <th className="px-4 py-2.5 text-right">จำนวนเงิน (บาท)</th>
                    <th className="px-3 py-2.5 text-center">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredOpexList.map((item) => {
                    const catKey = classifyExpenseCategory(item.category, item.name);
                    const catMeta = EXPENSE_CATEGORIES[catKey] || EXPENSE_CATEGORIES.admin_general;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/80">
                        <td className="px-4 py-2.5 font-mono text-slate-600">{item.month}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold border ${catMeta.colorClass.badge}`}
                          >
                            <span>{catMeta.icon}</span> {catMeta.shortLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100">{item.name}</td>
                        <td className="px-3 py-2.5 text-slate-600">{item.payMethod}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-950">
                          ฿{item.amount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteExpense(item.id, item.name)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="ลบรายการค่าใช้จ่าย"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredOpexList.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        ไม่พบรายการค่าใช้จ่ายในงวดนี้
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── ADD EXPENSE MODAL (WITH 6 STANDARD CATEGORIES & PRESETS) ── */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">บันทึกค่าใช้จ่ายใหม่ (6 หมวดหมู่มาตรฐาน)</h3>
                  <p className="text-xs text-slate-500">บันทึกรายจ่ายดำเนินงานร้าน ค่าน้ำ ค่าไฟ เคมีภัณฑ์ หรือการตลาด</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddExpenseModal(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">วันที่ทำรายการ *</Label>
                  <Input
                    type="date"
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="h-9 text-xs font-mono"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">หมวดหมู่มาตรฐาน *</Label>
                  <select
                    value={expCategory}
                    onChange={(e) => setExpCategory(e.target.value as ExpenseCategoryKey)}
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-bold text-slate-900"
                  >
                    {CATEGORY_LIST.filter((c) => c.key !== "payroll").map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.icon} {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Predefined Presets Chips */}
              <div className="space-y-1">
                <Label className="text-[11px] font-bold text-slate-500">⚡ เลือกรายการด่วน:</Label>
                <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto p-1 bg-slate-50 rounded-lg border border-slate-200">
                  {EXPENSE_CATEGORIES[expCategory]?.presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setExpTitle(preset)}
                      className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 border border-slate-200 hover:bg-teal-50 hover:text-teal-900 hover:border-teal-300 transition-all"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">ชื่อรายการค่าใช้จ่าย *</Label>
                <Input
                  type="text"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="เช่น ค่าน้ำประปาประจำเดือน, ซื้อแปรงขนม้า 3 อัน"
                  className="h-9 text-xs font-medium"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">จำนวนเงิน (บาท) *</Label>
                  <Input
                    type="number"
                    step="any"
                    value={expAmount || ""}
                    onChange={(e) => setExpAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="h-9 text-xs font-mono font-bold text-amber-950 bg-amber-50/40 border-amber-300"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">ช่องทางชำระเงิน *</Label>
                  <select
                    value={expPayMethod}
                    onChange={(e) => setExpPayMethod(e.target.value)}
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-900"
                  >
                    <option value="บัญชีร้าน (โอน)">บัญชีร้าน (โอน)</option>
                    <option value="เงินสดหน้าร้าน">เงินสดหน้าร้าน</option>
                    <option value="พร้อมเพย์">พร้อมเพย์</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="text-xs h-9"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs h-9 px-4 gap-1 shadow-xs"
                >
                  <Check className="h-4 w-4" /> บันทึกค่าใช้จ่าย
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── EDIT STAFF PROFILE & STATUS MODAL ── */}
      {editingProfileStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                  <Edit className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">แก้ไขข้อมูล & สถานะพนักงาน</h3>
                  <p className="text-xs text-slate-500">ปรับเปลี่ยนสถานะประจำ/ทดลองงาน และข้อมูลบัญชี</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProfileStaff(null)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveStaffProfile} className="space-y-4 text-xs">
              {/* Toggle Status (Regular vs Probation) */}
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">สถานะและประเภทการจ้างงาน *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditEmpType("monthly");
                      setEditSalary(12000);
                    }}
                    className={`p-3 rounded-xl border text-center font-bold transition-all ${
                      editEmpType === "monthly"
                        ? "bg-emerald-500 text-white border-teal-700 shadow-md ring-2 ring-teal-500/30"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    🟢 พนักงานประจำ
                    <div className="text-[10px] font-normal opacity-90">เงินเดือนประจำ + สิทธิ ปกส.</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditEmpType("probation_daily");
                      setEditDailyRate(350);
                    }}
                    className={`p-3 rounded-xl border text-center font-bold transition-all ${
                      editEmpType === "probation_daily"
                        ? "bg-amber-500 text-slate-950 border-amber-500 shadow-md ring-2 ring-amber-400/30"
                        : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    🟠 พนักงานทดลองงาน
                    <div className="text-[10px] font-normal opacity-90">คำนวณตามวันทำจริง (350฿/วัน)</div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="font-bold text-slate-700">ชื่อ-นามสกุล จริง *</Label>
                  <Input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">ชื่อเรียก/เล่น</Label>
                  <Input
                    type="text"
                    value={editNickname}
                    onChange={(e) => setEditNickname(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">เลขบัตรประจำตัวประชาชน (13 หลัก) *</Label>
                <Input
                  type="text"
                  value={editIdCardNo}
                  onChange={(e) => setEditIdCardNo(e.target.value)}
                  placeholder="เช่น 1-5099-01234-56-7"
                  className="h-9 text-xs font-mono"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">ตำแหน่งงาน</Label>
                <Input
                  type="text"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="h-9 text-xs"
                  placeholder="เช่น ช่างสปาหลัก, ผู้จัดการหน้าร้าน"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">ธนาคาร</Label>
                  <Input
                    type="text"
                    value={editBankName}
                    onChange={(e) => setEditBankName(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">เลขบัญชี / พร้อมเพย์</Label>
                  <Input
                    type="text"
                    value={editAccountNo}
                    onChange={(e) => setEditAccountNo(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              {editEmpType === "monthly" ? (
                <div className="space-y-1">
                  <Label className="font-bold text-teal-900">ฐานเงินเดือนประจำ (บาท/เดือน)</Label>
                  <Input
                    type="number"
                    value={editSalary}
                    onChange={(e) => setEditSalary(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label className="font-bold text-amber-900">อัตราค่าจ้างทดลองงาน (บาท/วัน)</Label>
                  <Input
                    type="number"
                    value={editDailyRate}
                    onChange={(e) => setEditDailyRate(parseFloat(e.target.value) || 0)}
                    className="h-9 text-xs font-mono font-bold"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingProfileStaff(null)}
                  className="text-xs h-9"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  size="sm"
                  className="bg-teal-700 hover:bg-emerald-600 text-white font-bold text-xs h-9 px-4 gap-1"
                >
                  <Check className="h-4 w-4" /> บันทึกการเปลี่ยนแปลง
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CREATE NEW STAFF MEMBER MODAL ── */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
                  <UserPlus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">เพิ่มพนักงานใหม่เข้าสู่ระบบ</h3>
                  <p className="text-xs text-slate-500">บันทึกข้อมูลพนักงานคนที่ 4, 5... พร้อมระบบเงินเดือน</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <Label className="font-bold text-slate-700">ประเภทการจ้างงาน *</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewStaffType("probation_daily");
                      setNewStaffSalary(350);
                    }}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      newStaffType === "probation_daily"
                        ? "bg-amber-500 text-slate-950 border-amber-500 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    ทดลองงาน (วันละ 350฿)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNewStaffType("monthly");
                      setNewStaffSalary(12000);
                    }}
                    className={`p-2.5 rounded-xl border text-center font-bold transition-all ${
                      newStaffType === "monthly"
                        ? "bg-emerald-500 text-white border-teal-700 shadow-xs"
                        : "bg-slate-50 text-slate-700 border-slate-200"
                    }`}
                  >
                    พนักงานประจำ (เงินเดือน)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="font-bold text-slate-700">ชื่อ-นามสกุล จริง *</Label>
                  <Input
                    type="text"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    placeholder="เช่น นายสมชาย ใจดี"
                    className="h-9 text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">ชื่อเล่น</Label>
                  <Input
                    type="text"
                    value={newStaffNickname}
                    onChange={(e) => setNewStaffNickname(e.target.value)}
                    placeholder="เช่น ชาย"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">เลขประจำตัวประชาชน (13 หลัก)</Label>
                <Input
                  type="text"
                  value={newStaffIdCard}
                  onChange={(e) => setNewStaffIdCard(e.target.value)}
                  placeholder="เช่น 1-5099-xxxxx-xx-x"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">ตำแหน่งงาน</Label>
                <Input
                  type="text"
                  value={newStaffPosition}
                  onChange={(e) => setNewStaffPosition(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">ธนาคาร</Label>
                  <Input
                    type="text"
                    value={newStaffBank}
                    onChange={(e) => setNewStaffBank(e.target.value)}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">เลขบัญชี / พร้อมเพย์</Label>
                  <Input
                    type="text"
                    value={newStaffAccount}
                    onChange={(e) => setNewStaffAccount(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="font-bold text-slate-700">
                  {newStaffType === "monthly" ? "ฐานเงินเดือน (บาท/เดือน)" : "อัตราค่าจ้าง (บาท/วัน)"}
                </Label>
                <Input
                  type="number"
                  value={newStaffSalary}
                  onChange={(e) => setNewStaffSalary(parseFloat(e.target.value) || 0)}
                  className="h-9 text-xs font-mono font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddStaffModal(false)}
                  className="text-xs h-9"
                >
                  ยกเลิก
                </Button>
                <Button
                  type="submit"
                  disabled={isPending}
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 px-4 gap-1"
                >
                  <Check className="h-4 w-4" /> สร้างพนักงาน
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── OFFICIAL STANDARD PAYSLIP VOUCHER MODAL ── */}
      {selectedPayslip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xs print:p-0 print:bg-white print:static">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-8 shadow-2xl border border-slate-300 print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full space-y-6">
            {/* Top Toolbar (Hidden on Print) */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3 print:hidden">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-teal-700" />
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  ใบแจ้งเงินเดือน / สลิปเงินเดือนพนักงาน (Official Payslip Voucher)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-teal-700 hover:bg-emerald-600 text-white font-bold text-xs gap-1.5 shadow-md"
                >
                  <Printer className="h-4 w-4" /> พิมพ์สลิปเงินเดือนทางการ (Print A4)
                </Button>
                <button
                  onClick={() => setSelectedPayslip(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* ── OFFICIAL PAYSLIP VOUCHER CONTAINER ── */}
            <div className="printable-area space-y-4 text-slate-900 dark:text-slate-950 font-sans border-2 border-slate-800 p-6 rounded-xl print:border-2 print:border-slate-900 print:p-6 bg-white dark:bg-white shadow-lg">
              {/* Header: Company Name & Tax Registration */}
              <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
                <div className="space-y-1">
                  <h1 className="text-lg font-black tracking-tight text-slate-950 uppercase">
                    {shopProfile?.name || "ยังไม่ได้ตั้งค่าชื่อกิจการ — ไปที่ /settings"}
                  </h1>
                  <div className="text-xs text-slate-700 font-medium">
                    {shopProfile?.address || "ยังไม่ได้ตั้งค่าที่อยู่"}
                  </div>
                  <div className="text-xs text-slate-600 font-mono">
                    เลขประจำตัวผู้เสียภาษีอากร: <strong>{shopProfile?.taxId || "-"}</strong>
                    {shopProfile?.phone ? ` · โทร. ${shopProfile.phone}` : ""}
                  </div>
                </div>
                <div className="text-right">
                  <div className="inline-block rounded-md bg-slate-900 px-3 py-1 text-xs font-black text-white tracking-wide">
                    PAYSLIP VOUCHER
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 pt-1">
                    เลขที่: PS-{selectedPayslip.month.replace("/", "")}-{selectedPayslip.idCardNo?.slice(-4) || "0001"}
                  </div>
                  <div className="text-[11px] text-slate-700 font-semibold">
                    วันที่จ่ายเงิน: 31 สิงหาคม 2569
                  </div>
                </div>
              </div>

              {/* Title Banner */}
              <div className="text-center font-bold text-sm bg-slate-100 py-1.5 rounded-md border border-slate-300">
                ใบจ่ายเงินเดือนและหลักฐานการรับเงิน ประจำงวดเดือน {selectedPayslip.month}
              </div>

              {/* Employee Information 2×2 Box */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-lg border border-slate-300">
                <div>
                  <span className="text-slate-500 font-semibold">ชื่อ-นามสกุล: </span>
                  <span className="font-bold text-slate-950">{selectedPayslip.employeeName}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">เลขประจำตัวประชาชน: </span>
                  <span className="font-mono font-bold text-slate-950">{selectedPayslip.idCardNo || "1-5099-xxxxx-xx-x"}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">ตำแหน่ง / แผนก: </span>
                  <span className="font-semibold text-slate-900">
                    {selectedPayslip.employeeRole || (selectedPayslip.employmentType === "monthly" ? "พนักงานประจำ" : "พนักงานทดลองงาน")}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-semibold">ช่องทางการชำระ: </span>
                  <span className="font-mono text-slate-900">
                    {selectedPayslip.bankName || "กสิกรไทย"} {selectedPayslip.accountNo || ""}
                  </span>
                </div>
              </div>

              {/* Earnings & Deductions Official Table */}
              <table className="w-full text-xs border border-slate-400">
                <thead className="bg-slate-200 font-bold border-b border-slate-400 text-slate-900">
                  <tr>
                    <th className="p-2.5 text-left w-1/2 border-r border-slate-300">รายการรับ (EARNINGS)</th>
                    <th className="p-2.5 text-left w-1/2">รายการหัก (DEDUCTIONS)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    {/* Left: Earnings */}
                    <td className="p-3 align-top space-y-1.5 border-r border-slate-300 bg-white">
                      <div className="flex justify-between">
                        <span>
                          {selectedPayslip.employmentType === "probation_daily"
                            ? `ค่าจ้างรายวัน (${selectedPayslip.daysWorked || 8} วัน @ ${selectedPayslip.dailyWage || 350}฿)`
                            : "เงินเดือนพื้นฐาน (Basic Salary)"}
                        </span>
                        <span className="font-mono font-semibold">
                          ฿{selectedPayslip.baseSalary.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>

                      {selectedPayslip.diligence > 0 && (
                        <div className="flex justify-between text-slate-800">
                          <span>เบี้ยขยัน (Diligence Allowance)</span>
                          <span className="font-mono font-semibold">
                            ฿{selectedPayslip.diligence.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {selectedPayslip.ot > 0 && (
                        <div className="flex justify-between text-slate-800">
                          <span>ค่าทำงานล่วงเวลา (Overtime Pay)</span>
                          <span className="font-mono font-semibold">
                            ฿{selectedPayslip.ot.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {selectedPayslip.commission > 0 && (
                        <div className="flex justify-between text-slate-800">
                          <span>ค่าคอมมิชชั่น/อินเซนทีฟ ({selectedPayslip.commPct}%)</span>
                          <span className="font-mono font-semibold">
                            ฿{selectedPayslip.commission.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Right: Deductions */}
                    <td className="p-3 align-top space-y-1.5 bg-white">
                      {selectedPayslip.ssoDeduction > 0 ? (
                        <div className="flex justify-between text-slate-800">
                          <span>เงินสมทบกองทุนประกันสังคม 5%</span>
                          <span className="font-mono font-semibold text-rose-700">
                            -฿{selectedPayslip.ssoDeduction.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ) : (
                        <div className="text-slate-400 text-[11px] italic">ไม่มีรายการหักประกันสังคม</div>
                      )}

                      {selectedPayslip.wht > 0 && (
                        <div className="flex justify-between text-slate-800">
                          <span>ภาษีเงินได้หัก ณ ที่จ่าย 3%</span>
                          <span className="font-mono font-semibold text-rose-700">
                            -฿{selectedPayslip.wht.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}

                      {selectedPayslip.otherDeductions > 0 && (
                        <div className="flex justify-between text-slate-800">
                          <span>หักขาด/ลา/มาสาย/อื่นๆ</span>
                          <span className="font-mono font-semibold text-rose-700">
                            -฿{selectedPayslip.otherDeductions.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                    </td>
                  </tr>
                </tbody>

                {/* Subtotals */}
                <tfoot className="bg-slate-100 border-t-2 border-slate-400 font-bold">
                  <tr>
                    <td className="p-2.5 border-r border-slate-300">
                      <div className="flex justify-between">
                        <span>รวมเงินได้ (Total Earnings):</span>
                        <span className="font-mono text-emerald-800 font-bold">
                          ฿{(selectedPayslip.baseSalary + selectedPayslip.diligence + selectedPayslip.ot + selectedPayslip.commission).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="flex justify-between">
                        <span>รวมรายการหัก (Total Deductions):</span>
                        <span className="font-mono text-rose-800 font-bold">
                          -฿{(selectedPayslip.ssoDeduction + selectedPayslip.wht + selectedPayslip.otherDeductions).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </td>
                  </tr>

                  {/* Grand Net Pay */}
                  <tr className="bg-teal-800 text-white font-bold">
                    <td colSpan={2} className="p-3">
                      <div className="flex justify-between items-center text-sm">
                        <span>จำนวนเงินจ่ายสุทธิ (NET PAY AMOUNT):</span>
                        <span className="text-base font-black text-teal-100 font-mono">
                          ฿{selectedPayslip.netPay.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท
                        </span>
                      </div>
                      <div className="text-xs font-normal text-teal-200 pt-1 text-right italic">
                        ({thaiBahtText(selectedPayslip.netPay)})
                      </div>
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures & Certification */}
              <div className="grid grid-cols-2 gap-8 pt-6 text-center text-xs">
                <div className="space-y-6">
                  <div className="border-b border-slate-400 w-4/5 mx-auto pb-8"></div>
                  <div>
                    <div className="font-bold">ลงชื่อ ................................................................</div>
                    <div className="text-[11px] text-slate-600 pt-1">(ผู้มีอำนาจลงนาม / ฝ่ายการเงินและบัญชี)</div>
                    <div className="text-[10px] text-slate-400">{shopProfile?.name || "SneakerCare"}</div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="border-b border-slate-400 w-4/5 mx-auto pb-8"></div>
                  <div>
                    <div className="font-bold">ลงชื่อ ................................................................</div>
                    <div className="text-[11px] text-slate-600 pt-1">({selectedPayslip.employeeName})</div>
                    <div className="text-[10px] text-slate-400">พนักงานผู้รับเงิน</div>
                  </div>
                </div>
              </div>

              {/* Footer Notice */}
              <div className="text-center text-[10px] text-slate-400 border-t border-slate-200 pt-2">
                เอกสารนี้เป็นหลักฐานการจ่ายเงินเดือนที่ออกโดยระบบอิเล็กทรอนิกส์ สามารถใช้ประกอบการทำธุรกรรมทางการเงินและยื่นสถาบันการเงินได้อย่างเป็นทางการ
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
