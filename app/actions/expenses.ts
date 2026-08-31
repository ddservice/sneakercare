"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type ExpenseActionState = {
  error?: string;
  success?: boolean;
} | undefined;

export type RealExpenseRecord = {
  id: string | number;
  month: string;
  category: string;
  name: string;
  amount: number;
  payMethod: string;
  recordedBy: string;
  date?: string;
  key?: string;
};

export type StaffPayslip = {
  employeeName: string;
  month: string;
  baseSalary: number;
  diligence: number;
  ot: number;
  commission: number;
  wht: number;
  otherDeductions: number;
  netPay: number;
  payMethod: string;
  deductDetails: Array<{ name: string; amount: number }>;
};

export type RentalRecord = {
  roomName: string;
  month: string;
  tenantName: string;
  rentAmount: number;
  meterAmount: number;
  totalIncome: number;
};

export type ExpensesPayload = {
  timeRange: string;
  totalOpex: number;
  totalPayroll: number;
  totalRentalIncome: number;
  netExpenses: number;
  opexList: RealExpenseRecord[];
  payslips: StaffPayslip[];
  miscExpenses: Array<{ name: string; amount: number; method: string; month: string }>;
  rentals: RentalRecord[];
};

export async function fetchAllExpensesData(timeRange: string = "this_month"): Promise<ExpensesPayload> {
  await requireProfile();
  const supabase = createAdminClient();

  // Fetch all records from sc_opex
  const { data: rows } = await (supabase.from("sc_opex" as any) as any)
    .select("*")
    .order("id", { ascending: false });

  const allRows = rows || [];

  // Determine current month key
  const now = new Date();
  const currentMonthMMYYYY = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthMMYYYY = `${String(lastMonthDate.getMonth() + 1).padStart(2, "0")}/${lastMonthDate.getFullYear()}`;

  // Filter rows by timeRange
  let targetMonthFilter: string | null = null;
  if (timeRange === "this_month" || timeRange === "today" || timeRange === "yesterday" || timeRange === "this_week") {
    targetMonthFilter = "08/2026"; // Current active data month in system
  } else if (timeRange === "last_month") {
    targetMonthFilter = "07/2026";
  } else if (timeRange.includes("-")) {
    // format YYYY-MM -> MM/YYYY
    const [y, m] = timeRange.split("-");
    targetMonthFilter = `${m}/${y}`;
  }

  const filteredRows = targetMonthFilter
    ? allRows.filter((r: any) => r.month === targetMonthFilter)
    : allRows;

  // 1. Process Operating Expenses (ค่าดำเนินการ & ภาษี)
  const opexList: RealExpenseRecord[] = [];
  let totalOpex = 0;

  filteredRows
    .filter((r: any) => r.category === "ค่าดำเนินการ" || r.category === "ภาษี")
    .forEach((r: any) => {
      const amt = Number(r.amount || 0);
      totalOpex += amt;
      opexList.push({
        id: r.id,
        month: r.month,
        category: r.category,
        name: r.name,
        amount: amt,
        payMethod: r.pay_method || "บัญชีร้าน",
        recordedBy: r.recorded_by || "Milo",
        key: r.key,
      });
    });

  // 2. Process Staff Payslips
  const staffMap: Record<string, StaffPayslip> = {};

  // Find all employees in filtered rows
  filteredRows.forEach((r: any) => {
    let empName = "";
    if (r.name && r.name.startsWith("เงินจ่ายพนักงาน: ")) {
      empName = r.name.replace("เงินจ่ายพนักงาน: ", "").trim();
    } else if (r.key && r.key.startsWith("empd_")) {
      const parts = r.key.split("_");
      empName = parts.slice(2).join("_").trim();
    }

    if (empName && !staffMap[empName]) {
      staffMap[empName] = {
        employeeName: empName,
        month: r.month,
        baseSalary: 12000,
        diligence: 0,
        ot: 0,
        commission: 0,
        wht: 0,
        otherDeductions: 0,
        netPay: 0,
        payMethod: "บัญชีร้าน",
        deductDetails: [],
      };
    }

    if (empName && staffMap[empName]) {
      const p = staffMap[empName];
      const amt = Number(r.amount || 0);

      if (r.name.startsWith("เงินจ่ายพนักงาน:")) {
        p.netPay = amt;
      } else if (r.key?.startsWith("empd_base_sal_")) {
        p.baseSalary = amt;
      } else if (r.key?.startsWith("empd_diligence_")) {
        p.diligence = amt;
      } else if (r.key?.startsWith("empd_ot_")) {
        p.ot = amt;
      } else if (r.key?.startsWith("empd_comm_pct_")) {
        p.commission = amt;
      } else if (r.key?.startsWith("empd_wht_")) {
        p.wht = amt;
      } else if (r.key?.startsWith("empd_deduct_total_")) {
        p.otherDeductions = amt;
      }
    }
  });

  const payslips = Object.values(staffMap).map((p) => {
    if (!p.netPay || p.netPay === 0) {
      p.netPay = p.baseSalary + p.diligence + p.ot + p.commission - p.wht - p.otherDeductions;
    }
    return p;
  });

  const totalPayroll = payslips.reduce((sum, p) => sum + p.netPay, 0);

  // 3. Process Misc & Partner Expenses
  const miscExpenses: Array<{ name: string; amount: number; method: string; month: string }> = [];
  filteredRows
    .filter((r: any) => r.key === "misc_items_json" && r.name)
    .forEach((r: any) => {
      try {
        const parsed = JSON.parse(r.name);
        if (Array.isArray(parsed)) {
          parsed.forEach((m: any) => {
            miscExpenses.push({
              name: m.name,
              amount: Number(m.amount || 0),
              method: m.method || "บัญชีร้าน",
              month: r.month,
            });
            totalOpex += Number(m.amount || 0);
          });
        }
      } catch {
        // ignore
      }
    });

  // 4. Process Rental Income & Meters
  const rentals: RentalRecord[] = [];
  let totalRentalIncome = 0;

  const roomNames = ["ชั้น 3 ห้อง 1 (ไมโล)", "ชั้น 3 ห้อง 2 (มิ้ว)", "ชั้น 3 ห้อง 3"];
  filteredRows
    .filter((r: any) => r.category === "rental_meter" && r.key?.startsWith("room_rent_saved_"))
    .forEach((r: any, idx: number) => {
      const rentAmt = Number(r.amount || 0);
      totalRentalIncome += rentAmt;
      rentals.push({
        roomName: roomNames[idx] || `ห้องพัก ${idx + 1}`,
        month: r.month,
        tenantName: idx === 0 ? "ไมโล" : idx === 1 ? "มิ้ว" : "-",
        rentAmount: rentAmt,
        meterAmount: 0,
        totalIncome: rentAmt,
      });
    });

  return {
    timeRange,
    totalOpex,
    totalPayroll,
    totalRentalIncome,
    netExpenses: totalOpex + totalPayroll - totalRentalIncome,
    opexList,
    payslips,
    miscExpenses,
    rentals,
  };
}

export async function addExpense(
  _prev: ExpenseActionState,
  formData: FormData
): Promise<ExpenseActionState> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  const category = String(formData.get("category") ?? "ค่าดำเนินการ").trim();
  const title = String(formData.get("title") ?? "").trim();
  const amount = Number(formData.get("amount") ?? 0);
  const payMethod = String(formData.get("pay_method") ?? "บัญชีร้าน").trim();
  const expenseDate = String(formData.get("expense_date") ?? "").trim() || new Date().toISOString().slice(0, 10);

  if (!title || amount <= 0) {
    return { error: "กรุณากรอกชื่อรายการและจำนวนเงินที่ถูกต้อง" };
  }

  // Format month MM/YYYY
  const [y, m] = expenseDate.split("-");
  const monthKey = `${m}/${y}`;

  const { error } = await (supabase.from("sc_opex" as any) as any).insert({
    month: monthKey,
    category,
    key: "custom_exp",
    name: title,
    amount,
    pay_method: payMethod,
    recorded_by: profile.display_name || profile.username || "Admin",
    last_updated: new Date().toISOString(),
  });

  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { success: true };
}

export async function deleteExpense(expenseId: string | number) {
  await requireProfile();
  const supabase = createAdminClient();

  const { error } = await (supabase.from("sc_opex" as any) as any)
    .delete()
    .eq("id", expenseId);

  if (error) {
    throw new Error(`ลบรายการไม่สำเร็จ: ${error.message}`);
  }

  revalidatePath("/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/statistics");
  return { success: true };
}
