"use client";

import { useState, useMemo, useTransition } from "react";
import {
  fetchAllExpensesData,
  addExpense,
  deleteExpense,
  deleteMiscExpenseItem,
  saveStaffPayrollAdjustment,
  saveStaffProfileInfo,
  createStaffMember,
  type ExpensesPayload,
  type StaffPayslip,
} from "@/app/actions/expenses";
import { recordRentalWht, upsertWhtPayee } from "@/app/actions/wht";
import {
  EXPENSE_CATEGORIES,
  CATEGORY_LIST,
  classifyExpenseCategory,
  type ExpenseCategoryKey,
} from "@/lib/expense-categories";
import {
  settleWht,
  WHT_RATES,
  BUILDING_RENT_CATEGORY,
  BUILDING_RENT_WHT_RATE,
} from "@/lib/wht";
import { thaiBahtText } from "@/lib/bahttext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrintModalPortal } from "@/components/print-modal-portal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { ModalBackdrop } from "@/components/modal-shell";
import { PageHeader } from "@/components/page-header";
import {
  Wallet,
  Building2,
  Users,
  Plus,
  Trash2,
  Receipt,
  Printer,
  X,
  UserPlus,
  Save,
  Percent,
  IdCard,
  Edit,
  ShieldCheck,
  Check,
  Filter,
  Layers,
  PieChart,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Contact,
} from "lucide-react";

const THAI_MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const THAI_MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/**
 * ⚠️ (แก้ 2026-09-02) เดิมรายการนี้เป็น array ตายตัว 10 เดือน (พ.ย. 2568 – ส.ค. 2569) เขียนไว้
 * ตอนสร้างฟีเจอร์ครั้งแรก แล้วไม่มีใครมาต่อให้ทุกเดือน — พอเข้าเดือนกันยายน ตัวเลือก "งวดล่าสุด"
 * ยังค้างเป็นสิงหาคมตลอดไป และไม่มีทางเลือกเดือนกันยายนได้เลยจาก dropdown นี้ สร้างจากวันที่จริง
 * แทน ย้อนหลัง 24 เดือนจากเดือนปัจจุบันเสมอ ไม่ต้องแก้โค้ดทุกเดือนอีกต่อไป
 */
function buildAvailableMonths(monthsBack = 24) {
  const now = new Date();
  const months = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const monthName = `${THAI_MONTH_NAMES[d.getMonth()]} ${yyyy + 543}`;
    months.push({
      value: `${mm}/${yyyy}`,
      iso: `${yyyy}-${mm}`,
      label: i === 0 ? `${monthName} (${mm}/${yyyy}) — งวดล่าสุด` : `${monthName} (${mm}/${yyyy})`,
      monthName,
    });
  }
  months.push({
    value: "all",
    iso: "all",
    label: `📊 ภาพรวมสะสมทุกงวด (All Time: ${monthsBack} เดือน)`,
    monthName: `ภาพรวมสะสมทั้งหมด (${monthsBack} เดือน)`,
  });
  return months;
}

/** วันที่สุดท้ายของเดือน (พ.ศ.) จากค่า "MM/YYYY" — ใช้แทนวันที่จ่ายเงินที่เคย hardcode เป็น "31 สิงหาคม 2569" ตรงๆ */
function lastDayOfMonthThai(monthValue: string): string {
  const [mm, yyyy] = monthValue.split("/").map(Number);
  if (!mm || !yyyy) return "-";
  const lastDay = new Date(yyyy, mm, 0).getDate(); // วันที่ 0 ของเดือนถัดไป = วันสุดท้ายของเดือนนี้
  return `${lastDay} ${THAI_MONTH_NAMES[mm - 1]} ${yyyy + 543}`;
}

export const AVAILABLE_MONTHS = buildAvailableMonths();
/** ค่า "MM/YYYY" ของเดือนปัจจุบัน — ใช้แทนเลข "08/2026" ที่เคย hardcode ไว้ */
export const LATEST_MONTH_VALUE = AVAILABLE_MONTHS[0].value;
/** ป้ายย่อของเดือนปัจจุบัน เช่น "ก.ย. 69" — ใช้แทนข้อความ "(ส.ค. 69)" ที่เคย hardcode ไว้ */
export const LATEST_MONTH_SHORT_LABEL = (() => {
  const now = new Date();
  return `${THAI_MONTH_SHORT[now.getMonth()]} ${String((now.getFullYear() + 543) % 100).padStart(2, "0")}`;
})();

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
    return LATEST_MONTH_VALUE;
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
  /** ยกเว้นประกันสังคม — สำหรับหุ้นส่วนผู้จัดการที่ไม่นับเป็นลูกจ้างตาม พ.ร.บ.ประกันสังคม */
  const [editSsoExempt, setEditSsoExempt] = useState(false);

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
  /** ยกเว้นประกันสังคม — สำหรับหุ้นส่วนผู้จัดการที่ไม่นับเป็นลูกจ้างตาม พ.ร.บ.ประกันสังคม */
  const [newStaffSsoExempt, setNewStaffSsoExempt] = useState(false);

  // Add Expense Modal State
  const [showAddExpenseModal, setShowAddExpenseModal] = useState(false);
  const [expCategory, setExpCategory] = useState<ExpenseCategoryKey>("facility_utilities");
  const [expTitle, setExpTitle] = useState("");
  const [expAmount, setExpAmount] = useState<number>(0);
  const [expPayMethod, setExpPayMethod] = useState("บัญชีร้าน (โอน)");
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expWithhold, setExpWithhold] = useState(false);
  const [expVat, setExpVat] = useState(false);
  const [expWhtRate, setExpWhtRate] = useState<number>(0);
  const [expPayeeId, setExpPayeeId] = useState("");
  const [expPayeeKind, setExpPayeeKind] = useState<"person" | "juristic">("person");
  const [expPayeeName, setExpPayeeName] = useState("");
  const [expPayeeTaxId, setExpPayeeTaxId] = useState("");
  const [expPayeeAddress, setExpPayeeAddress] = useState("");
  const [showPayeeBook, setShowPayeeBook] = useState(false);
  const [editingPayeeId, setEditingPayeeId] = useState("");
  const [bookPayeeKind, setBookPayeeKind] = useState<"person" | "juristic">("person");
  const [bookPayeeName, setBookPayeeName] = useState("");
  const [bookPayeeTaxId, setBookPayeeTaxId] = useState("");
  const [bookPayeeAddress, setBookPayeeAddress] = useState("");

  function resetPayeeBookForm() {
    setEditingPayeeId("");
    setBookPayeeKind("person");
    setBookPayeeName("");
    setBookPayeeTaxId("");
    setBookPayeeAddress("");
  }

  function openPayeeForEdit(payee: { id: string; kind: "person" | "juristic"; name: string; taxId: string; address: string }) {
    setEditingPayeeId(payee.id);
    setBookPayeeKind(payee.kind);
    setBookPayeeName(payee.name);
    setBookPayeeTaxId(payee.taxId);
    setBookPayeeAddress(payee.address);
  }

  function handleSavePayeeBook(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await upsertWhtPayee({
        id: editingPayeeId || undefined,
        kind: bookPayeeKind,
        name: bookPayeeName,
        taxId: bookPayeeTaxId,
        address: bookPayeeAddress,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success(editingPayeeId ? "แก้ไขผู้รับเงินแล้ว" : "เพิ่มผู้รับเงินในสมุดคู่ค้าแล้ว");
      resetPayeeBookForm();
      const updated = await fetchAllExpensesData(selectedMonth);
      setData(updated);
    });
  }

  // Interactive Live Values State for Staff (Keyed by employeeName)
  //
  // deductItems คือรายการหักย่อย (เช่น "มาสาย 3 ครั้ง", "ลากิจไม่แจ้งล่วงหน้า") — ผู้ใช้ขอให้แยก
  // ช่องหักอื่นๆ ออกเป็นหลายรายการได้ (เดิมมีแค่ช่องตัวเลขก้อนเดียว กรอกรายละเอียดไม่ได้เลย)
  // otherDeductions ยังคงอยู่เป็นผลรวมที่คำนวณจาก deductItems เสมอ ให้โค้ดส่วนอื่นที่อ่าน
  // draft.otherDeductions ทำงานต่อได้โดยไม่ต้องแก้ทุกจุด
  type DeductItem = { name: string; amount: number };
  type StaffDraft = {
    diligence: number;
    ot: number;
    commPct: number;
    daysWorked: number;
    otherDeductions: number;
    deductItems: DeductItem[];
  };
  const [staffDrafts, setStaffDrafts] = useState<Record<string, StaffDraft>>(() => {
    const initial: Record<string, StaffDraft> = {};
    initialData.payslips.forEach((p) => {
      const items: DeductItem[] =
        p.deductDetails && p.deductDetails.length > 0
          ? p.deductDetails
          : p.otherDeductions > 0
          ? [{ name: "อื่นๆ", amount: p.otherDeductions }]
          : [];
      initial[p.employeeName] = {
        diligence: p.diligence,
        ot: p.ot,
        commPct: p.commPct || 0,
        daysWorked: p.daysWorked || 8,
        otherDeductions: p.otherDeductions || 0,
        deductItems: items,
      };
    });
    return initial;
  });

  // Calculate Category Aggregation
  const categoryBreakdown = useMemo(() => {
    const map: Record<ExpenseCategoryKey, { total: number; count: number }> = {
      payroll: { total: data.totalPayroll, count: data.payslips.length },
      building_rent: { total: 0, count: 0 },
      facility_utilities: { total: 0, count: 0 },
      supplies_cogs: { total: 0, count: 0 },
      marketing: { total: 0, count: 0 },
      tax_professional: { total: 0, count: 0 },
      admin_general: { total: 0, count: 0 },
      partner_share: { total: 0, count: 0 },
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
  const liveWht = useMemo(
    () =>
      settleWht({
        baseAmount: expAmount,
        vatRate: expVat ? 7 : 0,
        whtRate: expWhtRate,
        category: expWithhold ? expCategory : undefined,
      }),
    [expAmount, expVat, expWhtRate, expWithhold, expCategory]
  );

  function onSelectExpenseCategory(next: ExpenseCategoryKey) {
    setExpCategory(next);
    if (next === BUILDING_RENT_CATEGORY) {
      setExpWithhold(true);
      setExpWhtRate(BUILDING_RENT_WHT_RATE);
    }
  }

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
      const newDrafts: Record<string, StaffDraft> = {};
      updated.payslips.forEach((p) => {
        const items: DeductItem[] =
          p.deductDetails && p.deductDetails.length > 0
            ? p.deductDetails
            : p.otherDeductions > 0
            ? [{ name: "อื่นๆ", amount: p.otherDeductions }]
            : [];
        newDrafts[p.employeeName] = {
          diligence: p.diligence,
          ot: p.ot,
          commPct: p.commPct || 0,
          daysWorked: p.daysWorked || 8,
          otherDeductions: p.otherDeductions || 0,
          deductItems: items,
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

  const emptyDraft = { diligence: 0, ot: 0, commPct: 0, daysWorked: 8, otherDeductions: 0, deductItems: [] as DeductItem[] };

  /** คำนวณ payslips/totalPayroll/netExpenses ใหม่จาก draft ล่าสุดของพนักงานคนหนึ่ง — ใช้ร่วมกัน
   * ทั้งตอนแก้ diligence/ot/commPct/daysWorked และตอนแก้รายการหักย่อย ไม่ให้สูตร netPay ไปซ้ำกันสองที่ */
  function applyDraftToData(empName: string, next: typeof emptyDraft) {
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
        const sso = p.employmentType === "monthly" && !p.ssoExempt ? 600 : 0;
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
          deductDetails: next.deductItems,
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
  }

  function updateStaffDraft(
    empName: string,
    field: "diligence" | "ot" | "commPct" | "daysWorked",
    value: number
  ) {
    setStaffDrafts((prev) => {
      const current = prev[empName] || emptyDraft;
      const next = { ...current, [field]: value };
      applyDraftToData(empName, next);
      return { ...prev, [empName]: next };
    });
  }

  /** เพิ่ม/แก้/ลบรายการหักย่อยหนึ่งแถว — otherDeductions คำนวณใหม่จากผลรวมของรายการเสมอ */
  function updateStaffDeductItems(empName: string, items: DeductItem[]) {
    setStaffDrafts((prev) => {
      const current = prev[empName] || emptyDraft;
      const otherDeductions = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      const next = { ...current, deductItems: items, otherDeductions };
      applyDraftToData(empName, next);
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
        deductDetails: p.deductDetails,
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
    setEditSsoExempt(!!p.ssoExempt);
  }

  // Save Edit Profile Modal
  function handleSaveStaffProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!editingProfileStaff) return;

    const nextSso = editEmpType === "monthly" && !editSsoExempt ? 600 : 0;

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
        ssoExempt: editSsoExempt,
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
                  ssoExempt: editSsoExempt,
                  ssoDeduction: nextSso,
                  netPay:
                    (editEmpType === "monthly" ? editSalary : editDailyRate * (p.daysWorked || 8)) +
                    p.diligence +
                    p.ot +
                    p.commission -
                    nextSso -
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
        ssoExempt: newStaffSsoExempt,
      });

      if (res.success) {
        toast.success(`เพิ่มพนักงานใหม่ "${newStaffName}" สำเร็จเรียบร้อย`);
        setShowAddStaffModal(false);
        setNewStaffSsoExempt(false);
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
      if (expWithhold) {
        formData.set("withhold", "1");
        formData.set("wht_rate", String(expWhtRate || (expCategory === BUILDING_RENT_CATEGORY ? BUILDING_RENT_WHT_RATE : 3)));
        formData.set("vat_rate", expVat ? "7" : "0");
        formData.set("payee_id", expPayeeId);
        formData.set("payee_kind", expPayeeKind);
        formData.set("payee_name", expPayeeName.trim());
        formData.set("payee_tax_id", expPayeeTaxId.replace(/[^0-9]/g, ""));
        formData.set("payee_address", expPayeeAddress.trim());
      }

      const res = await addExpense(undefined, formData);
      if (res.success) {
        toast.success(
          expWithhold
            ? `บันทึก "${expTitle}" พร้อมออกหนังสือรับรอง 50 ทวิ แล้ว`
            : `บันทึกค่าใช้จ่าย "${expTitle}" สำเร็จเรียบร้อย`
        );
        setShowAddExpenseModal(false);
        setExpTitle("");
        setExpAmount(0);
        setExpWithhold(false);
        setExpVat(false);
        setExpWhtRate(0);
        setExpPayeeId("");
        setExpPayeeName("");
        setExpPayeeTaxId("");
        setExpPayeeAddress("");
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
        // รายการย่อยของ "ค่าใช้จ่ายเบ็ดเตล็ด" ใช้ id สังเคราะห์ "${rowId}-misc-${itemIndex}"
        // เพราะไม่มีแถว sc_opex ของตัวเอง — ต้องแยกไปแก้ JSON แทนการลบทั้งแถว (ดู deleteMiscExpenseItem)
        const miscMatch = String(id).match(/^(\d+)-misc-(\d+)$/);
        if (miscMatch) {
          await deleteMiscExpenseItem(Number(miscMatch[1]), Number(miscMatch[2]));
        } else {
          await deleteExpense(id);
        }
        toast.success(`ลบรายการ "${name}" เรียบร้อยแล้ว`);
        const updated = await fetchAllExpensesData(selectedMonth);
        setData(updated);
      } catch (err) {
        toast.error(errorMessage(err, "ไม่สามารถลบรายการได้"));
      }
    });
  }

  return (
    <div className={`space-y-8 transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : "opacity-100"}`}>
      <PageHeader
        className="print:hidden"
        title="ค่าใช้จ่ายและเงินเดือน"
        description="บันทึกค่าใช้จ่ายตามหมวด ออกสลิปเงินเดือน และเก็บสมุดคู่ค้าสำหรับหัก ณ ที่จ่าย"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                resetPayeeBookForm();
                setShowPayeeBook(true);
              }}
              className="text-xs gap-1.5 h-9"
            >
              <Contact className="h-4 w-4" /> สมุดคู่ค้า / ผู้รับเงิน
            </Button>
            <Button
              onClick={() => setShowAddExpenseModal(true)}
              className="text-xs gap-1.5 h-9"
            >
              <Plus className="h-4 w-4" /> บันทึกค่าใช้จ่ายใหม่
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowAddStaffModal(true)}
              className="text-xs gap-1.5 h-9"
            >
              <UserPlus className="h-4 w-4" /> เพิ่มพนักงานใหม่
            </Button>
          </>
        }
      />

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
                onClick={() => handleSelectMonth(LATEST_MONTH_VALUE)}
                disabled={isPending || selectedMonth === LATEST_MONTH_VALUE}
                className="h-8 text-xs font-medium"
              >
                🎯 งวดล่าสุด ({LATEST_MONTH_SHORT_LABEL})
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
              <span className="text-xs font-medium text-slate-500">ยอดขายบริการ</span>
              <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
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
              <span className="text-xs font-medium text-slate-500">ค่าแรงและเงินเดือนรวม</span>
              <div className="text-xl font-semibold tabular-nums text-indigo-700">
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
              <span className="text-xs font-medium text-slate-500">ค่าดำเนินการ</span>
              <div className="text-xl font-semibold tabular-nums text-amber-700">
                ฿{data.totalOpex.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-400">สาธารณูปโภค, ค่าเช่า, การตลาด, ฯลฯ</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-2.5 text-amber-700">
              <Building2 className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 dark:border-slate-700 shadow-sm">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-medium text-slate-500">รวมค่าใช้จ่ายทั้งหมด</span>
              <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                ฿{data.netExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[10px] text-slate-400">
                เงินเดือน + ค่าดำเนินการ
                {data.totalPartnerShare > 0 && " (รวมส่วนแบ่งหุ้นส่วนแล้ว)"}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-2.5 text-slate-700">
              <Wallet className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Rental Income — แยกออกจากค่าใช้จ่ายโดยเจตนา (แก้บั๊ก 2026-09-02: เดิมถูกนับปนเป็น
          "ค่าดำเนินการ" เพราะ filter เช็คชื่อ category ผิด ทำให้รายรับกลายเป็นรายจ่ายในตัวเลขรวม) ── */}
      {data.rentals.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-900/20 dark:border-emerald-800/60 px-4 py-3 print:hidden space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-100 dark:bg-emerald-900/40 p-2 text-emerald-700 dark:text-emerald-300">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  รายได้อื่น — ค่าเช่าห้องจากพนักงาน (ไม่ปนกับยอดขายบริการ)
                </div>
                <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                  ลงบัญชียอดเต็ม · ถ้าผู้เช่าหักภาษีไว้ กรอกด้านล่าง (เงินเข้าจริงน้อยกว่า แต่รายได้ไม่ลด)
                </div>
              </div>
            </div>
            <div className="text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 shrink-0">
              +฿{data.totalRentalIncome.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
            </div>
          </div>
          <div className="grid gap-2">
            {data.rentals.map((r) => (
              <form
                key={`${r.month}-${r.roomId}-${r.id}`}
                className="grid gap-2 rounded-lg border border-emerald-100 bg-white/80 p-2 sm:grid-cols-6 sm:items-end"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!r.id) {
                    toast.error("รายการนี้มาจากข้อมูลเก่า ยังบันทึกหัก ณ ที่จ่ายฝั่งรายรับไม่ได้");
                    return;
                  }
                  const fd = new FormData(e.currentTarget);
                  startTransition(async () => {
                    const res = await recordRentalWht({
                      rentalId: r.id,
                      tenantName: String(fd.get("tenant_name") ?? ""),
                      tenantTaxId: String(fd.get("tenant_tax_id") ?? ""),
                      whtRate: Number(fd.get("wht_rate") || 0),
                    });
                    if (!res.success) {
                      toast.error(res.error);
                      return;
                    }
                    toast.success("บันทึกรายได้ค่าเช่า / ภาษีที่ถูกหักไว้แล้ว");
                    const updated = await fetchAllExpensesData(selectedMonth);
                    setData(updated);
                  });
                }}
              >
                <div className="sm:col-span-2 space-y-0.5">
                  <div className="text-[10px] font-bold text-emerald-800">{r.roomName}</div>
                  <Input name="tenant_name" defaultValue={r.tenantName} placeholder="ชื่อผู้เช่า" className="h-8 text-xs" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-[10px] text-emerald-800">เลขผู้เสียภาษี</div>
                  <Input name="tenant_tax_id" defaultValue={r.tenantTaxId} placeholder="13 หลัก" className="h-8 text-xs font-mono" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-[10px] text-emerald-800">ถูกหัก %</div>
                  <select name="wht_rate" defaultValue={String(r.whtRate || 0)} className="h-8 w-full rounded-md border px-2 text-xs">
                    <option value="0">ไม่ถูกหัก</option>
                    {WHT_RATES.map((rate) => (
                      <option key={rate} value={rate}>{rate}%</option>
                    ))}
                  </select>
                </div>
                <div className="text-[11px] text-emerald-900">
                  รายได้ ฿{r.totalIncome.toLocaleString()}
                  {r.whtWithheld > 0 && (
                    <div className="text-[10px] text-emerald-700">
                      ถูกหัก ฿{r.whtWithheld.toLocaleString()} · เข้าจริง ฿{r.cashReceived.toLocaleString()}
                    </div>
                  )}
                </div>
                <Button type="submit" size="sm" variant="outline" disabled={isPending} className="h-8 text-[11px]">
                  บันทึก
                </Button>
              </form>
            ))}
          </div>
        </div>
      )}

      {/* ── เตือนเมื่อ "ของที่ซื้อเข้าคลัง" กับ "ค่าใช้จ่ายหมวดของใช้" ไม่ตรงกัน ──────────
          ระบบมี ledger เงินสองสายที่แยกกันสนิท และหน้านี้อ่านแค่ sc_opex ⇒ ของที่ซื้อแล้ว
          บันทึกเฉพาะฝั่งคลังจะหายจากยอดค่าใช้จ่ายโดยไม่มี error ให้เห็น (เคยขาดเกือบ ฿21,000
          ช่วง ก.พ.–ก.ค. 69) แถบนี้ทำให้ความต่างนั้นมองเห็นได้ทันทีบนหน้าจอ ไม่ต้องรอกระทบยอด */}
      {data.stockCheck && data.stockCheck.stockPurchases - data.stockCheck.supplyExpenses > 0.02 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-800/60 px-4 py-3 print:hidden">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/40 p-2 text-amber-700 dark:text-amber-300">
              <AlertCircle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
                เดือนนี้มีของที่รับเข้าคลังแล้ว แต่ยังไม่ได้ลงเป็นค่าใช้จ่าย ฿
                {(data.stockCheck.stockPurchases - data.stockCheck.supplyExpenses).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-amber-800/80 dark:text-amber-400/80">
                รับเข้าคลัง ฿{data.stockCheck.stockPurchases.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ·
                ลงค่าใช้จ่ายไว้ ฿{data.stockCheck.supplyExpenses.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                {" — "}ตราบใดที่ยังไม่ลง กำไรที่เห็นจะสูงกว่าความเป็นจริง
              </div>
            </div>
          </div>
          <a
            href="/inventory"
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-900 hover:bg-amber-100 dark:bg-slate-900 dark:text-amber-200"
          >
            ดูรายการที่รับเข้าคลัง
          </a>
        </div>
      )}

      {/* ── ส่วนแบ่งกำไรหุ้นส่วน — แยกให้เห็นชัดเพราะเป็นเงินที่คำนวณ *จาก* กำไรสุทธิ
          แล้วบันทึกกลับเข้ามาเป็นค่าใช้จ่าย ถ้าไม่แยกออกมาจะไม่มีทางรู้ว่ากำไรก่อนแบ่งคือเท่าไร ── */}
      {data.totalPartnerShare > 0 && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-indigo-200 bg-indigo-50/70 dark:bg-indigo-900/20 dark:border-indigo-800/60 px-4 py-3 print:hidden">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-100 dark:bg-indigo-900/40 p-2 text-indigo-700 dark:text-indigo-300">
              <Users className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                ส่วนแบ่งกำไรหุ้นส่วน (20% ของกำไรสุทธิ)
              </div>
              <div className="text-[10px] text-indigo-700/80 dark:text-indigo-400/80">
                รวมอยู่ในยอด &ldquo;รวมค่าใช้จ่ายทั้งหมด&rdquo; แล้ว — คนละรายการกับเงินเดือนหุ้นส่วนผู้จัดการ
              </div>
            </div>
          </div>
          <div className="text-lg font-semibold tabular-nums text-indigo-700 dark:text-indigo-300 shrink-0">
            ฿{data.totalPartnerShare.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
          </div>
        </div>
      )}

      {/* ── 6-CATEGORY VISUAL BREAKDOWN SECTION ── */}
      <Card className="border-slate-200 shadow-sm print:hidden">
        <CardHeader className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PieChart className="h-4 w-4 text-teal-700" />
              โครงสร้างการแจกแจงค่าใช้จ่ายตามหมวดหมู่มาตรฐาน (Expense Breakdown)
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              วิเคราะห์สัดส่วนและยอดค่าใช้จ่ายที่เกิดขึ้นจริงในแต่ละประเภทธุรกิจ
            </CardDescription>
          </div>
          <div className="text-xs font-semibold text-slate-600 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-2xs">
            รวมทุกหมวด: <strong className="text-slate-900 font-mono">฿{data.netExpenses.toLocaleString()}</strong>
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
                    <Badge variant="outline" className={`text-[10px] font-medium shrink-0 ${cat.colorClass.badge}`}>
                      {cat.percentage}%
                    </Badge>
                  </div>

                  <div className="mt-3 flex items-baseline justify-between">
                    <div className="text-base font-semibold tabular-nums text-slate-900">
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
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveTab("overview");
                setSelectedCategoryFilter("all");
              }}
              className={`rounded-none border-b-2 px-3 text-xs font-medium ${
                activeTab === "overview"
                  ? "border-emerald-600 bg-transparent text-emerald-700 shadow-none"
                  : "border-transparent text-slate-500"
              }`}
            >
              <Layers className="h-3.5 w-3.5 mr-1" /> รวมค่าใช้จ่ายทั้งหมด
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveTab("payroll");
                setSelectedCategoryFilter("payroll");
              }}
              className={`rounded-none border-b-2 px-3 text-xs font-medium ${
                activeTab === "payroll"
                  ? "border-emerald-600 bg-transparent text-emerald-700 shadow-none"
                  : "border-transparent text-slate-500"
              }`}
            >
              <Users className="h-3.5 w-3.5 mr-1" /> บัญชีเงินเดือนพนักงาน ({data.payslips.length})
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActiveTab("opex");
                if (selectedCategoryFilter === "payroll") setSelectedCategoryFilter("all");
              }}
              className={`rounded-none border-b-2 px-3 text-xs font-medium ${
                activeTab === "opex"
                  ? "border-emerald-600 bg-transparent text-emerald-700 shadow-none"
                  : "border-transparent text-slate-500"
              }`}
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
                      <div className="space-y-1.5 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 font-semibold">หักอื่นๆ (ขาด/สาย ฯลฯ):</span>
                          {draft.otherDeductions > 0 && (
                            <span className="font-mono font-semibold text-rose-600">
                              -฿{draft.otherDeductions.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                            </span>
                          )}
                        </div>

                        {draft.deductItems.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <Input
                              type="text"
                              value={item.name}
                              placeholder="เช่น มาสาย 2 ครั้ง"
                              onChange={(e) => {
                                const next = draft.deductItems.map((d, i) =>
                                  i === idx ? { ...d, name: e.target.value } : d
                                );
                                updateStaffDeductItems(p.employeeName, next);
                              }}
                              className="h-6 flex-1 text-[11px]"
                            />
                            <Input
                              type="number"
                              value={item.amount || ""}
                              placeholder="0"
                              onChange={(e) => {
                                const next = draft.deductItems.map((d, i) =>
                                  i === idx ? { ...d, amount: parseFloat(e.target.value) || 0 } : d
                                );
                                updateStaffDeductItems(p.employeeName, next);
                              }}
                              className="h-6 w-16 font-mono text-[11px] text-right"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = draft.deductItems.filter((_, i) => i !== idx);
                                updateStaffDeductItems(p.employeeName, next);
                              }}
                              className="shrink-0 text-slate-400 hover:text-rose-600"
                              title="ลบรายการนี้"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}

                        <button
                          type="button"
                          onClick={() =>
                            updateStaffDeductItems(p.employeeName, [...draft.deductItems, { name: "", amount: 0 }])
                          }
                          className="text-[11px] font-semibold text-teal-700 hover:underline"
                        >
                          + เพิ่มรายการหัก
                        </button>
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
                variant="outline"
                onClick={() => {
                  resetPayeeBookForm();
                  setShowPayeeBook(true);
                }}
                className="text-xs gap-1.5 h-8"
              >
                <Contact className="h-3.5 w-3.5" /> สมุดคู่ค้า
              </Button>
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
                        <td className="px-3 py-2.5 font-bold text-slate-900 dark:text-slate-100">
                          {item.name}
                          {item.whtAmount ? (
                            <div className="text-[10px] font-medium text-rose-700">
                              หัก ณ ที่จ่าย {item.whtRate}% ฿{item.whtAmount.toLocaleString()}
                              {item.payeeName ? ` · ${item.payeeName}` : ""} · โอนสุทธิ ฿{item.netPayment?.toLocaleString()}
                            </div>
                          ) : null}
                        </td>
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

      {/* ── สมุดคู่ค้า / ผู้รับเงิน (เจ้าของตึก ซัพพลายเออร์ ออก 50 ทวิ) ── */}
      {showPayeeBook && (
        <ModalBackdrop
          onClose={() => setShowPayeeBook(false)}
          className="bg-black/60 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-800 flex items-center justify-center">
                  <Contact className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">สมุดคู่ค้า / ผู้รับเงิน</h3>
                  <p className="text-xs text-slate-500">เจ้าของตึก ซัพพลายเออร์ ผู้รับจ้าง — เก็บชื่อและเลข 13 หลักไว้เลือกตอนจ่าย</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPayeeBook(false)}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              {(data.payees ?? []).length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">ยังไม่มีรายชื่อ — กรอกด้านล่างแล้วกดบันทึก</div>
              ) : (
                <ul className="divide-y divide-slate-100 text-xs">
                  {(data.payees ?? []).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => openPayeeForEdit(p)}
                        className={`w-full px-3 py-2 text-left hover:bg-slate-50 ${editingPayeeId === p.id ? "bg-teal-50" : ""}`}
                      >
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="font-mono text-[10px] text-slate-500">
                          {p.kind === "juristic" ? "นิติบุคคล · ภ.ง.ด.53" : "บุคคลธรรมดา · ภ.ง.ด.3"} · {p.taxId}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={handleSavePayeeBook} className="space-y-3 text-xs">
              <div className="text-[11px] font-bold text-slate-600">
                {editingPayeeId ? "แก้ไขผู้รับเงินที่เลือก" : "เพิ่มผู้รับเงินใหม่"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">ประเภท</Label>
                  <select
                    value={bookPayeeKind}
                    onChange={(e) => setBookPayeeKind(e.target.value as "person" | "juristic")}
                    className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
                  >
                    <option value="person">บุคคลธรรมดา (ภ.ง.ด.3)</option>
                    <option value="juristic">นิติบุคคล (ภ.ง.ด.53)</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="font-bold text-slate-700">เลขผู้เสียภาษี 13 หลัก *</Label>
                  <Input
                    value={bookPayeeTaxId}
                    onChange={(e) => setBookPayeeTaxId(e.target.value)}
                    className="h-9 text-xs font-mono"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="font-bold text-slate-700">ชื่อ-สกุล / ชื่อบริษัท *</Label>
                <Input
                  value={bookPayeeName}
                  onChange={(e) => setBookPayeeName(e.target.value)}
                  className="h-9 text-xs"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label className="font-bold text-slate-700">ที่อยู่ (สำหรับ 50 ทวิ)</Label>
                <Input
                  value={bookPayeeAddress}
                  onChange={(e) => setBookPayeeAddress(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                {editingPayeeId && (
                  <Button type="button" variant="outline" size="sm" className="h-9 text-xs" onClick={resetPayeeBookForm}>
                    ยกเลิกแก้ไข
                  </Button>
                )}
                <Button type="submit" disabled={isPending} size="sm" className="h-9 text-xs gap-1">
                  <Save className="h-4 w-4" /> {editingPayeeId ? "บันทึกการแก้ไข" : "เพิ่มผู้รับเงิน"}
                </Button>
              </div>
            </form>
          </div>
        </ModalBackdrop>
      )}

      {/* ── ADD EXPENSE MODAL (WITH 6 STANDARD CATEGORIES & PRESETS) ── */}
      {showAddExpenseModal && (
        <ModalBackdrop
          onClose={() => setShowAddExpenseModal(false)}
          dismissOnBackdrop={false}
          className="bg-black/60 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">บันทึกค่าใช้จ่ายใหม่ (หมวดหมู่มาตรฐาน)</h3>
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
                    onChange={(e) => onSelectExpenseCategory(e.target.value as ExpenseCategoryKey)}
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

              <label className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={expWithhold}
                  onChange={(e) => {
                    setExpWithhold(e.target.checked);
                    if (e.target.checked && !expWhtRate) {
                      setExpWhtRate(expCategory === BUILDING_RENT_CATEGORY ? BUILDING_RENT_WHT_RATE : 3);
                    }
                  }}
                />
                <span className="text-xs font-bold text-slate-800">หักภาษี ณ ที่จ่าย (ออกหนังสือรับรอง 50 ทวิ อัตโนมัติ)</span>
              </label>

              {expWithhold && (
                <div className="space-y-3 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="font-bold text-slate-700">อัตราหัก ณ ที่จ่าย</Label>
                      <select
                        value={expWhtRate}
                        onChange={(e) => setExpWhtRate(Number(e.target.value))}
                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
                      >
                        {WHT_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%{rate === 5 ? " (ค่าเช่าอาคาร)" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 pt-5 text-xs font-bold text-slate-700">
                      <input type="checkbox" checked={expVat} onChange={(e) => setExpVat(e.target.checked)} />
                      มี VAT 7%
                    </label>
                  </div>
                  <div className="rounded-md bg-white px-3 py-2 text-[11px] text-slate-700 space-y-0.5 font-mono">
                    <div>ฐานก่อน VAT ฿{liveWht.baseAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                    {liveWht.vatAmount > 0 && (
                      <div>+ VAT {liveWht.vatRate}% ฿{liveWht.vatAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                    )}
                    <div>ลงบัญชี (ค่าใช้จ่าย) ฿{liveWht.grossAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                    <div className="text-rose-700">− WHT {liveWht.whtRate}% ฿{liveWht.whtAmount.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                    <div className="font-bold">ยอดโอนสุทธิ ฿{liveWht.netPayment.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</div>
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-700">ผู้รับเงินในสมุดคู่ค้า</Label>
                    <select
                      value={expPayeeId}
                      onChange={(e) => {
                        const id = e.target.value;
                        setExpPayeeId(id);
                        const p = (data.payees ?? []).find((x) => x.id === id);
                        if (p) {
                          setExpPayeeKind(p.kind);
                          setExpPayeeName(p.name);
                          setExpPayeeTaxId(p.taxId);
                          setExpPayeeAddress(p.address);
                        }
                      }}
                      className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
                    >
                      <option value="">— กรอกใหม่ด้านล่าง —</option>
                      {(data.payees ?? []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.taxId}
                        </option>
                      ))}
                    </select>
                    {(data.payees ?? []).length === 0 && (
                      <p className="text-[10px] text-slate-500">
                        ยังไม่มีรายชื่อ — กรอกด้านล่าง หรือเปิดปุ่ม “สมุดคู่ค้า / ผู้รับเงิน” ที่หัวหน้านี้
                      </p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="font-bold text-slate-700">ประเภทผู้รับเงิน</Label>
                      <select
                        value={expPayeeKind}
                        onChange={(e) => setExpPayeeKind(e.target.value as "person" | "juristic")}
                        className="w-full h-9 rounded-md border border-slate-300 bg-white px-2.5 text-xs"
                      >
                        <option value="person">บุคคลธรรมดา (ภ.ง.ด.3)</option>
                        <option value="juristic">นิติบุคคล (ภ.ง.ด.53)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="font-bold text-slate-700">เลขผู้เสียภาษี 13 หลัก *</Label>
                      <Input value={expPayeeTaxId} onChange={(e) => setExpPayeeTaxId(e.target.value)} className="h-9 text-xs font-mono" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-700">ชื่อเจ้าของตึก / ผู้รับเงิน *</Label>
                    <Input value={expPayeeName} onChange={(e) => setExpPayeeName(e.target.value)} className="h-9 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-700">ที่อยู่ (สำหรับ 50 ทวิ)</Label>
                    <Input value={expPayeeAddress} onChange={(e) => setExpPayeeAddress(e.target.value)} className="h-9 text-xs" />
                  </div>
                </div>
              )}

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
        </ModalBackdrop>
      )}

      {/* ── EDIT STAFF PROFILE & STATUS MODAL ── */}
      {editingProfileStaff && (
        <ModalBackdrop
          onClose={() => setEditingProfileStaff(null)}
          dismissOnBackdrop={false}
          className="bg-black/60 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
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

              {editEmpType === "monthly" && (
                <label
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs cursor-pointer transition-colors ${
                    editSsoExempt
                      ? "border-amber-300 bg-amber-50/70 text-amber-900"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={editSsoExempt}
                    onChange={(e) => setEditSsoExempt(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-amber-500"
                  />
                  <span>
                    <span className="font-bold">ยกเว้นประกันสังคม (ปกส.)</span>
                    <span className="block mt-0.5 text-[11px] opacity-80">
                      ใช้สำหรับหุ้นส่วนผู้จัดการ/ผู้บริหารที่ไม่นับเป็น &ldquo;ลูกจ้าง&rdquo; ตาม พ.ร.บ.ประกันสังคม
                      — ไม่หัก 600 บาท/เดือน แม้ตั้งเป็นพนักงานประจำ ควรยืนยันกับนักบัญชีก่อนติ๊กเลือก
                    </span>
                  </span>
                </label>
              )}

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
        </ModalBackdrop>
      )}

      {/* ── CREATE NEW STAFF MEMBER MODAL ── */}
      {showAddStaffModal && (
        <ModalBackdrop
          onClose={() => setShowAddStaffModal(false)}
          dismissOnBackdrop={false}
          className="bg-black/60 backdrop-blur-xs"
        >
          <div className="my-auto w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
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

              {newStaffType === "monthly" && (
                <label
                  className={`flex items-start gap-2.5 rounded-xl border p-3 text-xs cursor-pointer transition-colors ${
                    newStaffSsoExempt
                      ? "border-amber-300 bg-amber-50/70 text-amber-900"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={newStaffSsoExempt}
                    onChange={(e) => setNewStaffSsoExempt(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 accent-amber-500"
                  />
                  <span>
                    <span className="font-bold">ยกเว้นประกันสังคม (ปกส.)</span>
                    <span className="block mt-0.5 text-[11px] opacity-80">
                      สำหรับหุ้นส่วนผู้จัดการ/ผู้บริหารที่ไม่นับเป็น &ldquo;ลูกจ้าง&rdquo; ตาม พ.ร.บ.ประกันสังคม
                    </span>
                  </span>
                </label>
              )}

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
        </ModalBackdrop>
      )}

      {/* ── OFFICIAL STANDARD PAYSLIP VOUCHER MODAL ── */}
      {selectedPayslip && (
        <PrintModalPortal>
        <ModalBackdrop
          onClose={() => setSelectedPayslip(null)}
          className="bg-slate-950/80 backdrop-blur-xs print:p-0 print:bg-white print:static print:overflow-visible"
        >
          <div className="my-auto w-full max-w-2xl rounded-2xl bg-white p-4 sm:p-8 shadow-2xl border border-slate-300 print:shadow-none print:border-none print:p-0 print:max-w-none print:w-full space-y-4 sm:space-y-6">
            {/* Top Toolbar (Hidden on Print) */}
            {/* sticky: กันปุ่มพิมพ์/ปุ่มปิดหลุดจอเมื่อสลิปยาวกว่าหน้าจอ (โดยเฉพาะบนมือถือ)
                — ตัว backdrop คือ scroll container ของ modal นี้ */}
            <div className="sticky top-0 z-10 -mx-4 -mt-4 rounded-t-2xl flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 pt-4 pb-3 sm:-mx-8 sm:-mt-8 sm:px-8 sm:pt-8 print:hidden">
              <div className="flex min-w-0 items-center gap-2">
                <ShieldCheck className="h-5 w-5 shrink-0 text-teal-700" />
                <span className="truncate text-sm font-bold text-slate-900">
                  <span className="hidden sm:inline">ใบแจ้งเงินเดือน / สลิปเงินเดือนพนักงาน (Official Payslip Voucher)</span>
                  <span className="sm:hidden">สลิปเงินเดือน</span>
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-teal-700 hover:bg-emerald-600 text-white font-bold text-xs gap-1.5 shadow-md"
                >
                  <Printer className="h-4 w-4" />
                  <span className="hidden sm:inline">พิมพ์สลิปเงินเดือนทางการ (Print A4)</span>
                  <span className="sm:hidden">พิมพ์ A4</span>
                </Button>
                <button
                  aria-label="ปิด"
                  onClick={() => setSelectedPayslip(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* ── OFFICIAL PAYSLIP VOUCHER CONTAINER ── */}
            <div className="printable-area space-y-4 text-slate-900 dark:text-slate-950 font-sans border-2 border-slate-800 p-6 rounded-xl print:border-2 print:border-slate-900 print:p-4 print:space-y-2 print:text-[11px] print:break-inside-avoid bg-white dark:bg-white shadow-lg">
              {/* Header: Company Name & Tax Registration */}
              <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4 print:pb-2">
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
                <div className="text-right space-y-1">
                  <div className="text-lg font-black text-slate-900 tracking-tight">
                    ใบจ่ายเงินเดือน
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500 tracking-widest uppercase">
                    Payslip Voucher
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 pt-1">
                    เลขที่: PS-{selectedPayslip.month.replace("/", "")}-{selectedPayslip.idCardNo?.slice(-4) || "0001"}
                  </div>
                  <div className="text-[11px] text-slate-700 font-semibold">
                    วันที่จ่ายเงิน: {lastDayOfMonthThai(selectedPayslip.month)}
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

                      {!!selectedPayslip.pairBonus && selectedPayslip.pairBonus > 0 && (
                        <div className="flex justify-between text-slate-800">
                          <span>โบนัสจำนวนคู่ ({selectedPayslip.pairsHandled ?? 0} คู่)</span>
                          <span className="font-mono font-semibold">
                            ฿{selectedPayslip.pairBonus.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
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

                      {selectedPayslip.deductDetails && selectedPayslip.deductDetails.length > 0 ? (
                        // แสดงแยกรายการถ้ามีรายละเอียด แต่รวมไว้บรรทัดเดียวกันแบบกระชับ ไม่ขึ้นบรรทัด
                        // ใหม่ทีละรายการ — กันสลิปยาวเกิน 1 หน้าเวลาพิมพ์เมื่อมีรายการหักหลายรายการ
                        <div className="flex justify-between text-slate-800">
                          <span>
                            หักอื่นๆ:{" "}
                            <span className="font-normal text-[10px] text-slate-500">
                              {selectedPayslip.deductDetails.map((d) => `${d.name} ฿${d.amount.toLocaleString("th-TH")}`).join(", ")}
                            </span>
                          </span>
                          <span className="font-mono font-semibold text-rose-700 shrink-0 pl-2">
                            -฿{selectedPayslip.otherDeductions.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      ) : (
                        selectedPayslip.otherDeductions > 0 && (
                          <div className="flex justify-between text-slate-800">
                            <span>หักขาด/ลา/มาสาย/อื่นๆ</span>
                            <span className="font-mono font-semibold text-rose-700">
                              -฿{selectedPayslip.otherDeductions.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )
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
                          ฿{(selectedPayslip.baseSalary + selectedPayslip.diligence + selectedPayslip.ot + selectedPayslip.commission + (selectedPayslip.pairBonus ?? 0)).toLocaleString("th-TH", { minimumFractionDigits: 2 })}
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
              <div className="grid grid-cols-2 gap-8 print:gap-4 pt-6 print:pt-3 text-center text-xs">
                <div className="space-y-6 print:space-y-3">
                  <div className="border-b border-slate-400 w-4/5 mx-auto pb-8 print:pb-4"></div>
                  <div>
                    <div className="font-bold">ลงชื่อ ................................................................</div>
                    <div className="text-[11px] text-slate-600 pt-1">(ผู้มีอำนาจลงนาม / ฝ่ายการเงินและบัญชี)</div>
                    {/* fallback เดิมเคยเป็นชื่อแบรนด์ตัวระบบ ("SneakerCare") — บนสลิปเงินเดือน
                        ของ tenant ไหนก็ตาม ถ้า fetch ไม่สำเร็จ ต้องไม่แสดงชื่อกิจการของ tenant
                        อื่น/ชื่อแพลตฟอร์มปนไปในเอกสารที่ออกจริง จึงใช้ข้อความกลางแทนเสมอ */}
                    <div className="text-[10px] text-slate-400">{shopProfile?.name || "ยังไม่ได้ตั้งชื่อกิจการ"}</div>
                  </div>
                </div>

                <div className="space-y-6 print:space-y-3">
                  <div className="border-b border-slate-400 w-4/5 mx-auto pb-8 print:pb-4"></div>
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
        </ModalBackdrop>
        </PrintModalPortal>
      )}
    </div>
  );
}
