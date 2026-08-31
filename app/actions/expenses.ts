"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type StaffPayslip = {
  employeeName: string;
  nickname?: string;
  month: string;
  employmentType: "monthly" | "probation_daily";
  dailyWage?: number;
  daysWorked?: number;
  baseSalary: number;
  diligence: number;
  ot: number;
  commPct?: number;
  commission: number;
  wht: number; // 3% of commission
  ssoDeduction: number; // 5% of base salary for monthly staff
  otherDeductions: number;
  netPay: number;
  payMethod: string;
  employeeRole?: string;
  deductDetails?: Array<{ name: string; amount: number }>;
};

export type RealExpenseRecord = {
  id: string | number;
  month: string;
  category: string;
  name: string;
  amount: number;
  payMethod: string;
  recordedBy: string;
  key?: string;
};

export type RentalRecord = {
  roomId: number;
  roomName: string;
  tenantName: string;
  rentAmount: number;
  prevMeter: number;
  currMeter: number;
  electricCost: number;
  totalIncome: number;
  month: string;
};

export type ExpensesPayload = {
  timeRange: string;
  totalMonthlySales: number;
  totalPayroll: number;
  totalOpex: number;
  totalRentalIncome: number;
  netExpenses: number;
  opexList: RealExpenseRecord[];
  payslips: StaffPayslip[];
  miscExpenses: Array<{ name: string; amount: number; method: string; month: string }>;
  rentals: RentalRecord[];
};

export type ExpenseActionState = {
  error?: string;
  success?: boolean;
};

function extractCleanEmployeeName(key: string, name: string): string | null {
  if (name && name.startsWith("เงินจ่ายพนักงาน: ")) {
    return name.replace("เงินจ่ายพนักงาน: ", "").trim();
  }
  if (!key) return null;
  const prefixes = [
    "empd_base_sal_",
    "empd_comm_pct_",
    "empd_diligence_",
    "empd_ot_",
    "empd_wht_",
    "empd_deduct_total_",
    "empd_deduct_json_",
    "emp_",
  ];
  for (const p of prefixes) {
    if (key.startsWith(p)) {
      const extracted = key.slice(p.length).trim();
      if (extracted) return extracted;
    }
  }
  return null;
}

export async function fetchAllExpensesData(timeRange: string = "this_month"): Promise<ExpensesPayload> {
  await requireProfile();
  const supabase = createAdminClient();

  // Fetch all records from sc_opex
  const { data: rows } = await (supabase.from("sc_opex" as any) as any)
    .select("*")
    .order("id", { ascending: false });

  const allRows = rows || [];

  // Filter rows by timeRange
  let targetMonthFilter: string = "08/2026";
  let targetSalesMonth: string = "2026-08";

  if (timeRange === "this_month" || timeRange === "today" || timeRange === "yesterday" || timeRange === "this_week") {
    targetMonthFilter = "08/2026";
    targetSalesMonth = "2026-08";
  } else if (timeRange === "last_month") {
    targetMonthFilter = "07/2026";
    targetSalesMonth = "2026-07";
  } else if (timeRange.includes("-")) {
    const [y, m] = timeRange.split("-");
    targetMonthFilter = `${m}/${y}`;
    targetSalesMonth = `${y}-${m}`;
  }

  // Fetch real sales for the month to calculate commission %
  const { data: salesRows } = await (supabase.from("sc_sales" as any) as any)
    .select("date, total_amount")
    .gte("date", `${targetSalesMonth}-01`)
    .lte("date", `${targetSalesMonth}-31`);

  const totalMonthlySales = (salesRows || []).reduce(
    (sum: number, r: any) => sum + Number(r.total_amount || 0),
    0
  );

  const filteredRows = allRows.filter((r: any) => r.month === targetMonthFilter);

  // 1. Process Operating Expenses (ค่าดำเนินการ & ภาษี)
  const opexList: RealExpenseRecord[] = [];
  let totalOpex = 0;

  filteredRows
    .filter((r: any) => r.category === "ค่าดำเนินการ" || r.category === "ภาษี" || r.category === "ค่าเช่าร้าน" || r.category === "ค่าการตลาด")
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

  // 1. นายธีรภัทร ทาแผ (เชียง): พนักงานประจำ (เงินเดือน) - หยุดพุธ
  staffMap["นายธีรภัทร ทาแผ (เชียง)"] = {
    employeeName: "นายธีรภัทร ทาแผ (เชียง)",
    nickname: "เชียง",
    month: targetMonthFilter,
    employmentType: "monthly",
    baseSalary: 12000,
    diligence: 500,
    ot: 675,
    commPct: 0,
    commission: 0,
    wht: 0,
    ssoDeduction: 600,
    otherDeductions: 0,
    netPay: 12575, // 12000 + 500 + 675 - 600
    payMethod: "บัญชีร้าน (โอน)",
    employeeRole: "พนักงานประจำ / ช่างหลัก",
  };

  // 2. น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว): พนักงานประจำ (เงินเดือน) - หยุดอาทิตย์
  staffMap["น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว)"] = {
    employeeName: "น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว)",
    nickname: "มิ้ว",
    month: targetMonthFilter,
    employmentType: "monthly",
    baseSalary: 12000,
    diligence: 500,
    ot: 0,
    commPct: 0,
    commission: 0,
    wht: 0,
    ssoDeduction: 600,
    otherDeductions: 0,
    netPay: 11900, // 12000 + 500 - 600
    payMethod: "บัญชีร้าน (โอน)",
    employeeRole: "พนักงานประจำ / ผู้จัดการหน้าร้าน",
  };

  // 3. เจ (พนักงานทดลองงาน): วันละ 350฿ x 26 วัน - หยุดศุกร์
  staffMap["เจ (พนักงานทดลองงาน)"] = {
    employeeName: "เจ (พนักงานทดลองงาน)",
    nickname: "เจ",
    month: targetMonthFilter,
    employmentType: "probation_daily",
    dailyWage: 350,
    daysWorked: 26,
    baseSalary: 9100, // 26 * 350
    diligence: 500,
    ot: 0,
    commPct: 0,
    commission: 0,
    wht: 0,
    ssoDeduction: 0, // ยกเว้นประกันสังคมช่วงทดลองงาน
    otherDeductions: 0,
    netPay: 9600, // 9100 + 500
    payMethod: "บัญชีร้าน (โอน)",
    employeeRole: "พนักงานทดลองงาน / ช่างสปา (350฿/วัน)",
  };

  // Merge any saved custom records from sc_opex
  filteredRows.forEach((r: any) => {
    const rawEmp = extractCleanEmployeeName(r.key || "", r.name || "");
    if (!rawEmp) return;

    // Normalize name to our 3 staff members if matched
    let empName = rawEmp;
    if (rawEmp.includes("ธีรภัทร") || rawEmp.includes("เชียง")) {
      empName = "นายธีรภัทร ทาแผ (เชียง)";
    } else if (rawEmp.includes("สุทธินันท์") || rawEmp.includes("มิ้ว")) {
      empName = "น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว)";
    } else if (rawEmp.includes("เจ")) {
      empName = "เจ (พนักงานทดลองงาน)";
    }

    if (!staffMap[empName]) {
      staffMap[empName] = {
        employeeName: empName,
        month: r.month || targetMonthFilter,
        employmentType: "monthly",
        baseSalary: 12000,
        diligence: 500,
        ot: 0,
        commPct: 0,
        commission: 0,
        wht: 0,
        ssoDeduction: 600,
        otherDeductions: 0,
        netPay: 11900,
        payMethod: "บัญชีร้าน (โอน)",
        employeeRole: "พนักงานประจำ",
      };
    }

    const p = staffMap[empName];
    const amt = Number(r.amount || 0);

    if (r.key?.startsWith("empd_base_sal_")) {
      p.baseSalary = amt;
    } else if (r.key?.startsWith("empd_diligence_")) {
      p.diligence = amt;
    } else if (r.key?.startsWith("empd_ot_")) {
      p.ot = amt;
    } else if (r.key?.startsWith("empd_comm_pct_")) {
      p.commPct = amt;
      p.commission = Math.round((totalMonthlySales * amt) / 100);
      p.wht = Math.round(p.commission * 0.03); // WHT 3% on commission
    } else if (r.key?.startsWith("empd_wht_")) {
      p.wht = amt;
    } else if (r.key?.startsWith("empd_deduct_total_")) {
      p.otherDeductions = amt;
    }
  });

  // Calculate Net Pay for all staff
  const payslips = Object.values(staffMap).map((p) => {
    // If commission % is set, recompute commission & 3% WHT
    if (p.commPct && p.commPct > 0) {
      p.commission = Math.round((totalMonthlySales * p.commPct) / 100);
      p.wht = Math.round(p.commission * 0.03);
    }
    p.netPay = p.baseSalary + p.diligence + p.ot + p.commission - p.wht - p.ssoDeduction - p.otherDeductions;
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

  const roomTenants = [
    { id: 0, name: "ชั้น 3 ห้อง 1", tenant: "ไมโล (Milo)", defaultRent: 3000 },
    { id: 1, name: "ชั้น 3 ห้อง 2", tenant: "มิ้ว (Milk)", defaultRent: 3000 },
    { id: 2, name: "ชั้น 3 ห้อง 3", tenant: "ห้องว่าง / สต็อก", defaultRent: 0 },
  ];

  roomTenants.forEach((rm) => {
    let rent = rm.defaultRent;
    const rentRow = filteredRows.find((r: any) => r.key === `room_rent_saved_${rm.id}`);
    if (rentRow && Number(rentRow.amount) > 0) {
      rent = Number(rentRow.amount);
    }
    const prevRow = filteredRows.find((r: any) => r.key === `room_prev_meter_${rm.id}`);
    const currRow = filteredRows.find((r: any) => r.key === `room_curr_meter_${rm.id}`);

    const prev = prevRow ? Number(prevRow.amount || 0) : 0;
    const curr = currRow ? Number(currRow.amount || 0) : 0;
    const electric = Math.max(0, (curr - prev) * 8); // 8฿/unit
    const total = rent + electric;

    if (rent > 0) {
      totalRentalIncome += total;
    }

    rentals.push({
      roomId: rm.id,
      roomName: rm.name,
      tenantName: rm.tenant,
      rentAmount: rent,
      prevMeter: prev,
      currMeter: curr,
      electricCost: electric,
      totalIncome: total,
      month: targetMonthFilter,
    });
  });

  const netExpenses = totalPayroll + totalOpex - totalRentalIncome;

  return {
    timeRange,
    totalMonthlySales,
    totalPayroll,
    totalOpex,
    totalRentalIncome,
    netExpenses,
    opexList,
    payslips,
    miscExpenses,
    rentals,
  };
}

export async function saveStaffPayrollAdjustment(payload: {
  month: string;
  employeeName: string;
  employmentType: "monthly" | "probation_daily";
  baseSalary: number;
  diligence: number;
  ot: number;
  commPct: number;
  commission: number;
  wht: number;
  ssoDeduction: number;
  otherDeductions: number;
  netPay: number;
  payMethod: string;
}): Promise<ExpenseActionState> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  const m = payload.month;
  // Get pure name for key without brackets e.g. "นายธีรภัทร ทาแผ"
  let cleanKeyName = payload.employeeName;
  if (cleanKeyName.includes("ธีรภัทร")) cleanKeyName = "นายธีรภัทร ทาแผ";
  else if (cleanKeyName.includes("สุทธินันท์")) cleanKeyName = "น.ส.สุทธินันท์ นนทจันทร์";
  else if (cleanKeyName.includes("เจ")) cleanKeyName = "เจ";

  const keysToSave = [
    { key: `emp_${cleanKeyName}`, name: `เงินจ่ายพนักงาน: ${cleanKeyName}`, amount: payload.netPay, category: "ค่าแรงพนักงาน" },
    { key: `empd_base_sal_${cleanKeyName}`, name: `empd_base_sal_${cleanKeyName}: ${cleanKeyName}`, amount: payload.baseSalary, category: "payslip_detail" },
    { key: `empd_diligence_${cleanKeyName}`, name: `empd_diligence_${cleanKeyName}: ${cleanKeyName}`, amount: payload.diligence, category: "payslip_detail" },
    { key: `empd_ot_${cleanKeyName}`, name: `empd_ot_${cleanKeyName}: ${cleanKeyName}`, amount: payload.ot, category: "payslip_detail" },
    { key: `empd_comm_pct_${cleanKeyName}`, name: `empd_comm_pct_${cleanKeyName}: ${cleanKeyName}`, amount: payload.commPct, category: "payslip_detail" },
    { key: `empd_wht_${cleanKeyName}`, name: `empd_wht_${cleanKeyName}: ${cleanKeyName}`, amount: payload.wht, category: "payslip_detail" },
    { key: `empd_deduct_total_${cleanKeyName}`, name: `empd_deduct_total_${cleanKeyName}: ${cleanKeyName}`, amount: payload.otherDeductions, category: "payslip_detail" },
  ];

  for (const item of keysToSave) {
    await (supabase.from("sc_opex" as any) as any)
      .delete()
      .eq("month", m)
      .eq("key", item.key);

    await (supabase.from("sc_opex" as any) as any).insert({
      month: m,
      category: item.category,
      key: item.key,
      name: item.name,
      amount: item.amount,
      pay_method: payload.payMethod || "บัญชีร้าน",
      recorded_by: profile.display_name,
      last_updated: new Date().toISOString(),
    });
  }

  revalidatePath("/expenses");
  return { success: true };
}

export async function addExpense(
  _prevState: ExpenseActionState | undefined,
  formData: FormData
): Promise<ExpenseActionState> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  const title = (formData.get("title") as string)?.trim();
  const category = (formData.get("category") as string)?.trim() || "ค่าดำเนินการ";
  const amount = parseFloat(formData.get("amount") as string);
  const payMethod = (formData.get("pay_method") as string) || "บัญชีร้าน";
  const expenseDate = (formData.get("expense_date") as string) || new Date().toISOString().slice(0, 10);

  if (!title) return { error: "กรุณาระบุชื่อรายการค่าใช้จ่าย" };
  if (isNaN(amount) || amount <= 0) return { error: "กรุณาระบุจำนวนเงินที่ถูกต้อง" };

  const [y, m] = expenseDate.split("-");
  const monthKey = `${m}/${y}`;

  const { error } = await (supabase.from("sc_opex" as any) as any).insert({
    month: monthKey,
    category,
    name: title,
    amount,
    pay_method: payMethod,
    recorded_by: profile.display_name,
    key: `custom_${Date.now()}`,
    last_updated: new Date().toISOString(),
  });

  if (error) {
    return { error: `ไม่สามารถบันทึกได้: ${error.message}` };
  }

  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteExpense(id: string | number) {
  await requireProfile();
  const supabase = createAdminClient();

  const { error } = await (supabase.from("sc_opex" as any) as any)
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`ไม่สามารถลบรายการได้: ${error.message}`);
  }

  revalidatePath("/expenses");
  return { success: true };
}
