"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

/** เดือนปัจจุบันในรูปแบบ "MM/YYYY" ที่ตาราง sc_opex ใช้ทั้งไฟล์ */
function currentMonthMY(): string {
  const now = new Date();
  return `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
}

export type StaffPayslip = {
  employeeName: string;
  nickname?: string;
  idCardNo?: string;
  bankName?: string;
  accountNo?: string;
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
  /** ยกเว้นประกันสังคม เช่น หุ้นส่วนผู้จัดการที่ไม่นับเป็น "ลูกจ้าง" ตาม พ.ร.บ.ประกันสังคม —
   * ไม่หัก ปกส. แม้จะเป็นพนักงานประจำ (employmentType === "monthly") ก็ตาม */
  ssoExempt?: boolean;
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
    "empd_profile_",
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

  // Determine target month or all-time
  //
  // ⚠️ (แก้ 2026-09-02) เดิมค่า "เดือนนี้"/"วันนี้"/"เมื่อวาน"/"สัปดาห์นี้" ทุกตัวถูก hardcode เป็น
  // "08/2026" ตรงๆ — เดือนสิงหาคมคือเดือนที่เขียนโค้ดนี้ครั้งแรก แต่พอเดือนเปลี่ยนไปเรื่อยๆ หน้า
  // /expenses จะค้างแสดงข้อมูลสิงหาคมตลอดกาล ไม่ขยับตามวันที่จริงเลย ทำให้ยอดเงินที่เห็นไม่ตรงกับ
  // ที่บันทึกไว้จริงในเดือนปัจจุบัน (ผู้ใช้รายงานปัญหานี้เมื่อเข้าเดือนกันยายน) แก้ให้คำนวณจากวันที่
  // จริงบนเซิร์ฟเวอร์แทน
  const now = new Date();
  const thisMonthMY = currentMonthMY();
  const thisMonthISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  /** เลื่อนคีย์เดือนแบบ "MM/YYYY" ไปข้างหน้า/ถอยหลัง คืนทั้งรูปแบบ MM/YYYY และ YYYY-MM */
  function shiftMonthMY(monthYear: string, delta: number): { my: string; iso: string } {
    const [m, y] = monthYear.split("/").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return {
      my: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
    };
  }

  const isAllTime = timeRange === "all";
  let targetMonthFilter: string = thisMonthMY;
  let targetSalesMonth: string = thisMonthISO;

  if (isAllTime) {
    targetMonthFilter = "all";
    targetSalesMonth = "all";
  } else if (timeRange === "this_month" || timeRange === "today" || timeRange === "yesterday" || timeRange === "this_week") {
    targetMonthFilter = thisMonthMY;
    targetSalesMonth = thisMonthISO;
  } else if (timeRange === "last_month") {
    const prev = shiftMonthMY(thisMonthMY, -1);
    targetMonthFilter = prev.my;
    targetSalesMonth = prev.iso;
  } else if (timeRange.includes("/")) {
    targetMonthFilter = timeRange;
    const [m, y] = timeRange.split("/");
    targetSalesMonth = `${y}-${m}`;
  } else if (timeRange.includes("-")) {
    const [y, m] = timeRange.split("-");
    targetMonthFilter = `${m}/${y}`;
    targetSalesMonth = `${y}-${m}`;
  }

  // Fetch sales to calculate commission %
  let salesQuery = (supabase.from("sc_sales" as any) as any).select("date, total_revenue, grand_total, discount");
  if (!isAllTime) {
    salesQuery = salesQuery.gte("date", `${targetSalesMonth}-01`).lte("date", `${targetSalesMonth}-31`);
  }
  const { data: salesRows } = await salesQuery;

  const totalMonthlySales = (salesRows || []).reduce(
    (sum: number, r: any) => sum + Number(r.total_revenue || (Number(r.grand_total || 0) - Number(r.discount || 0))),
    0
  );

  // Filter rows by month
  const filteredRows = isAllTime ? allRows : allRows.filter((r: any) => r.month === targetMonthFilter);

  // ข้อมูลโปรไฟล์พนักงาน (เลขบัตร/บัญชีธนาคาร/ชื่อเล่น/ประเภทการจ้าง) เป็นข้อมูลถาวรของคน
  // ไม่ใช่ตัวเลขรายเดือน แต่ถูกบันทึกปนอยู่ใน sc_opex แถวเดียวกับตัวเลขเงินเดือนที่ผูกกับเดือน —
  // ถ้ากรองด้วย targetMonthFilter เดียวกัน พอเปลี่ยนไปดูเดือนอื่น (เช่น เดือนที่ยังไม่เคยบันทึก
  // เงินเดือนเลย) ข้อมูลโปรไฟล์นี้จะหายไปทั้งหมดทันที ทั้งที่ควรอยู่ติดกับพนักงานเสมอไม่ว่าจะดู
  // เดือนไหน — ดึงแยกจากทุกเดือน เอาแถวล่าสุดต่อ key (saveStaffProfileInfo ลบแถวเก่าแล้ว insert
  // ใหม่ทุกครั้งที่แก้ไข ปกติมีแถวเดียวต่อคนอยู่แล้ว แต่กันเหนียวด้วย id สูงสุดเผื่อมีซ้ำ)
  const profileRowsLatest = new Map<string, any>();
  for (const r of allRows) {
    if (!r.key?.startsWith("empd_profile_") || !r.name) continue;
    const existing = profileRowsLatest.get(r.key);
    if (!existing || Number(r.id ?? 0) > Number(existing.id ?? 0)) {
      profileRowsLatest.set(r.key, r);
    }
  }
  const profileRows = [...profileRowsLatest.values()];

  // ⚠️ (แก้ 2026-09-02) เดิม filter เช็ค r.category !== "rental_meter" แต่ข้อมูลรายรับห้องเช่าจริง
  // ในตารางใช้ category = "rental_income" (คนละคำกับที่ filter เช็ค) — ไม่เคยถูกกรองออกเลยสักแถว
  // ผลคือ "รายรับ" ห้องเช่าถูกนับรวมเป็น "รายจ่าย" ในยอดค่าดำเนินการ (OPEX) มาตลอด ทำให้ยอดค่าใช้จ่าย
  // รวมพองขึ้นผิดๆ ด้วยรายรับ ไม่ใช่รายจ่ายจริง ผู้ใช้สังเกตเห็นจากรายการ "รายรับห้องเช่า" โผล่อยู่ใน
  // หมวดค่าดำเนินการ แก้ให้กรองออกด้วยชื่อ category ที่ถูกต้อง และแยกไปคำนวณเป็น totalRentalIncome
  // /rentals ต่างหาก ไม่ปนกับค่าใช้จ่าย

  // 1. Process Operating Expenses (Excluding internal detail, rental income/meter, and
  //    per-employee net-pay rows already counted in totalPayroll)
  //
  // ⚠️ (แก้ 2026-09-02) พบว่า OPEX เดิมรวมยอด "รวมค่าใช้จ่ายทั้งหมด" นับซ้ำอย่างน้อย 2 เรื่องใหญ่:
  //  1. rental_meter (แถวมิเตอร์ไฟ/ค่าเช่าที่ตั้งค่าไว้ — ข้อมูลภายในสำหรับคำนวณ ไม่ใช่รายจ่ายจริง)
  //     กับ rental_income (แถวรายรับค่าเช่าจริง) เป็นคนละ category กัน ต้องกันทั้งคู่ออก —
  //     พลาดแก้ตอนแรกโดยเอา rental_meter ออกแล้วใส่แค่ rental_income เข้าไปแทน (แก้แล้ว)
  //  2. category "ค่าแรงพนักงาน" (แถว key เช่น "emp_ชื่อพนักงาน" ที่ saveStaffPayrollAdjustment
  //     บันทึกยอด netPay ไว้) ถูกนับเข้า OPEX ด้วย ทั้งที่ยอดเดียวกันนี้ถูกนับใน totalPayroll
  //     (จาก payslips.reduce(netPay)) อยู่แล้ว — เดือน ส.ค. 69 เพียงเดือนเดียวเงินเดือนถูกนับซ้ำ
  //     ไปถึง ฿27,275 ทำให้ "รวมค่าใช้จ่ายทั้งหมด" สูงเกินจริงมาตลอด (ไม่ใช่แค่เดือนนี้ — ทุกเดือนที่
  //     เคยบันทึกเงินเดือนผ่านหน้านี้) — กันออกด้วย category ตรงๆ (คนละ string กับหมวด "ค่าแรง &
  //     เงินเดือน" ที่ใช้ตอนกดเพิ่มรายจ่ายทั่วไปแบบ manual ผ่าน /expenses ซึ่งยังนับปกติ)
  //  ยอด ภาษี/ประกันสังคม (sso_employee, sso_employer) ยังคงนับต่อไปตามเดิม — เป็นเงินสดจริงที่ร้าน
  //  ต้องจ่ายให้ประกันสังคมนอกเหนือจาก netPay ที่จ่ายให้พนักงาน ไม่ใช่การนับซ้ำ
  const opexList: RealExpenseRecord[] = [];
  let totalOpex = 0;

  filteredRows
    .filter(
      (r: any) =>
        r.category !== "payslip_detail" &&
        r.category !== "rental_income" &&
        r.category !== "rental_meter" &&
        r.category !== "ค่าแรงพนักงาน" &&
        // key="misc" คือยอดรวมของ misc_items_json (ตรวจสอบแล้วว่าเท่ากันทุกเดือนย้อนหลังทั้งหมด
        // ไม่ใช่คนละยอด) — แสดงเป็นรายการย่อยจาก misc_items_json แทน ไม่นับแถวสรุปนี้ซ้ำ
        r.key !== "misc" &&
        !r.name?.startsWith("empd_") &&
        !r.category?.startsWith("empd_")
    )
    .forEach((r: any) => {
      const amt = Number(r.amount || 0);
      if (amt > 0 && amt < 10000000) {
        totalOpex += amt;
        opexList.push({
          id: r.id,
          month: r.month,
          category: r.category || "ค่าดำเนินการ",
          name: r.name,
          amount: amt,
          payMethod: r.pay_method || "บัญชีร้าน",
          recordedBy: r.recorded_by || "Milo",
          key: r.key,
        });
      }
    });

  // 2. Process Staff Payslips
  const staffMap: Record<string, StaffPayslip> = {};

  // 1. นายธีรภัทร ทาแผ (เชียง): พนักงานประจำ
  staffMap["นายธีรภัทร ทาแผ (เชียง)"] = {
    employeeName: "นายธีรภัทร ทาแผ (เชียง)",
    nickname: "เชียง",
    idCardNo: "1-5099-01234-56-7",
    bankName: "กสิกรไทย (KBANK)",
    accountNo: "055-3-68148-0",
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
    employeeRole: "พนักงานประจำ / ช่างสปาหลัก",
  };

  // 2. น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว): พนักงานประจำ
  staffMap["น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว)"] = {
    employeeName: "น.ส.สุทธินันท์ นนทจันทร์ (มิ้ว)",
    nickname: "มิ้ว",
    idCardNo: "1-5099-09876-54-3",
    bankName: "กสิกรไทย (KBANK)",
    accountNo: "213-8-97898-5",
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

  // 3. เจ (พนักงานทดลองงาน): เริ่มงาน 24 ส.ค. 2569
  staffMap["เจ (พนักงานทดลองงาน)"] = {
    employeeName: "เจ (พนักงานทดลองงาน)",
    nickname: "เจ",
    idCardNo: "1-5099-05555-12-3",
    bankName: "กสิกรไทย / พร้อมเพย์",
    accountNo: "089-xxx-xxxx",
    month: targetMonthFilter,
    employmentType: "probation_daily",
    dailyWage: 350,
    daysWorked: 8,
    baseSalary: 2800,
    diligence: 0,
    ot: 0,
    commPct: 0,
    commission: 0,
    wht: 0,
    ssoDeduction: 0,
    otherDeductions: 0,
    netPay: 2800,
    payMethod: "บัญชีร้าน (โอน)",
    employeeRole: "ช่างสปารองเท้า (ทดลองงาน)",
  };

  // Fetch registered staff from sc_employees to include 4th, 5th, etc.
  const { data: dbEmployees } = await (supabase.from("sc_employees" as any) as any).select("*");
  (dbEmployees || []).forEach((emp: any) => {
    const matchedKey = Object.keys(staffMap).find(
      (k) => k.includes(emp.name) || (emp.nickname && k.includes(emp.nickname))
    );
    if (!matchedKey) {
      const isProbation = emp.position?.includes("ทดลองงาน") || (emp.salary && emp.salary < 1000);
      const isDaily = isProbation || emp.salary <= 500;
      const salary = Number(emp.salary || (isDaily ? 350 : 12000));
      const dailyWage = isDaily ? salary : 350;
      const days = 8;
      const baseSalary = isDaily ? dailyWage * days : salary;
      const ssoExempt = !!emp.sso_exempt;
      const sso = isDaily || ssoExempt ? 0 : Math.round(baseSalary * 0.05);

      staffMap[emp.name] = {
        employeeName: emp.name,
        nickname: emp.nickname || "",
        idCardNo: emp.id_card_no || "ยังไม่ได้ระบุ",
        bankName: emp.bank || "กสิกรไทย",
        accountNo: emp.account || "-",
        month: targetMonthFilter,
        employmentType: isDaily ? "probation_daily" : "monthly",
        dailyWage: isDaily ? dailyWage : undefined,
        daysWorked: isDaily ? days : undefined,
        baseSalary: baseSalary,
        diligence: 0,
        ot: 0,
        commPct: Number(emp.comm_rate || 0),
        commission: 0,
        wht: 0,
        ssoDeduction: sso,
        ssoExempt,
        otherDeductions: 0,
        netPay: baseSalary - sso,
        payMethod: "บัญชีร้าน (โอน)",
        employeeRole: emp.position || (isDaily ? "พนักงานทดลองงาน" : "พนักงานประจำ"),
      };
    }
  });

  // Merge any saved custom records from sc_opex
  // (ต่อท้ายด้วย profileRows เสมอ ไม่ว่าจะซ้ำกับ filteredRows หรือไม่ — ประมวลผลซ้ำได้อย่างปลอดภัย
  // เพราะ branch นี้แค่ set field ทับด้วยค่าเดิม ไม่มีผลข้างเคียงสะสม)
  [...filteredRows, ...profileRows].forEach((r: any) => {
    const rawEmp = extractCleanEmployeeName(r.key || "", r.name || "");
    if (!rawEmp) return;

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
      // commission/wht คำนวณจริงในรอบ "Calculate Net Pay for all staff" ด้านล่างเท่านั้น
      // (สูตรเดียวกัน คำนวณซ้ำสองรอบไม่มีประโยชน์ — เอาออกกันงงว่าใครชนะ)
      p.commPct = amt;
    } else if (r.key?.startsWith("empd_wht_")) {
      p.wht = amt;
    } else if (r.key?.startsWith("empd_deduct_total_")) {
      // fallback สำหรับข้อมูลเก่าที่บันทึกเป็นยอดหักก้อนเดียว ไม่มีรายละเอียด (ไม่มี
      // empd_deduct_items_ คู่กัน) — ถ้ามี empd_deduct_items_ จะถูกเขียนทับด้วยค่าที่ถูกต้องด้านล่าง
      p.otherDeductions = amt;
    } else if (r.key?.startsWith("empd_deduct_items_") && r.name) {
      try {
        const items = JSON.parse(r.name);
        if (Array.isArray(items)) {
          p.deductDetails = items;
          p.otherDeductions = items.reduce((sum: number, i: any) => sum + Number(i.amount || 0), 0);
        }
      } catch (err) {
        console.error(`[expenses] parse empd_deduct_items JSON ล้มเหลว (key=${r.key}):`, err);
      }
    } else if (r.key?.startsWith("empd_deduct_json_") && r.name) {
      // ข้อมูลเก่าจากฟีเจอร์รายการหักย่อยรุ่นก่อน (schema {type, detail, minutes, rate, amount} —
      // ละเอียดกว่าที่ใช้ตอนนี้ แต่ไม่เคยถูกอ่านย้อนกลับมาแสดงที่ไหนเลย เจอตอนไล่หา key
      // "empd_deduct_total_" 2026-09-02) แปลงเป็นรูปแบบเดียวกับ deductDetails ปัจจุบันเพื่อไม่ให้
      // ข้อมูลเดือนเก่า (มี.ค.–มิ.ย. 69) หายไปจากหน้าจอ — ใช้เป็น fallback เท่านั้น
      // empd_deduct_items_ (คีย์ใหม่) จะทับค่านี้อีกทีถ้ามีอยู่คู่กัน
      if (!p.deductDetails || p.deductDetails.length === 0) {
        try {
          const legacyItems = JSON.parse(r.name);
          if (Array.isArray(legacyItems) && legacyItems.length > 0) {
            p.deductDetails = legacyItems.map((i: any) => ({
              name: [i.type, i.detail].filter(Boolean).join(" ") || "อื่นๆ",
              amount: Number(i.amount || 0),
            }));
            p.otherDeductions = p.deductDetails.reduce((sum, i) => sum + i.amount, 0);
          }
        } catch (err) {
          console.error(`[expenses] parse empd_deduct_json (รูปแบบเก่า) ล้มเหลว (key=${r.key}):`, err);
        }
      }
    } else if (r.key?.startsWith("empd_profile_") && r.name) {
      try {
        const parsed = JSON.parse(r.name);
        if (parsed.idCardNo) p.idCardNo = parsed.idCardNo;
        if (parsed.bankName) p.bankName = parsed.bankName;
        if (parsed.accountNo) p.accountNo = parsed.accountNo;
        if (parsed.nickname) p.nickname = parsed.nickname;
        if (parsed.employeeRole) p.employeeRole = parsed.employeeRole;
        p.ssoExempt = !!parsed.ssoExempt;
        if (parsed.employmentType) {
          p.employmentType = parsed.employmentType;
          if (parsed.employmentType === "monthly") {
            p.ssoDeduction = 600;
            p.baseSalary = parsed.baseSalary || 12000;
            p.dailyWage = undefined;
            p.daysWorked = undefined;
          } else {
            p.ssoDeduction = 0;
            p.dailyWage = parsed.dailyWage || 350;
            p.daysWorked = parsed.daysWorked || 8;
            p.baseSalary = (parsed.dailyWage || 350) * (parsed.daysWorked || 8);
          }
        }
      } catch (err) {
        // ข้ามแถวนี้แถวเดียว ไม่ให้ทั้งหน้าพัง แต่ต้อง log ไว้ ไม่งั้นข้อมูลโปรไฟล์พัง
        // (เช่น เลขบัญชีธนาคารหาย) จะเงียบเหมือนที่เคยเกิดกับ audit log มาก่อน
        console.error(`[expenses] parse empd_profile JSON ล้มเหลว (key=${r.key}):`, err);
      }
    }
  });

  // Calculate Net Pay for all staff
  const payslips = Object.values(staffMap).map((p) => {
    if (p.commPct && p.commPct > 0) {
      p.commission = Math.round((totalMonthlySales * p.commPct) / 100);
      p.wht = Math.round(p.commission * 0.03);
    }

    // ยกเว้น ปกส. ได้แม้เป็นพนักงานประจำ — สำหรับหุ้นส่วนผู้จัดการที่ไม่นับเป็น "ลูกจ้าง"
    // ตาม พ.ร.บ.ประกันสังคม (ดู CLAUDE.md 2026-09-02)
    if (p.employmentType === "monthly" && !p.ssoExempt) {
      p.ssoDeduction = 600;
    } else {
      p.ssoDeduction = 0;
    }

    p.netPay =
      p.baseSalary +
      p.diligence +
      p.ot +
      p.commission -
      p.ssoDeduction -
      p.wht -
      p.otherDeductions;

    return p;
  });

  const totalPayroll = payslips.reduce((sum, p) => sum + p.netPay, 0);

  // Miscellaneous expenses
  //
  // ⚠️ (แก้ 2026-09-02 — แก้ 2 รอบ รอบแรกเข้าใจผิด) รอบแรกคิดว่ายอด misc หายไปจากยอดรวมเพราะ
  // filter เดิมเช็ค r.category === "misc_items_json" ผิด (ของจริง category="payslip_detail",
  // key="misc_items_json") เลย "แก้" ด้วยการดันรายการย่อยเข้า opexList/totalOpex — ที่จริงแล้ว
  // มีแถวสรุป key="misc" (category="ค่าดำเนินการ") เก็บยอดรวมเดียวกันนี้ไว้อยู่แล้ว และแถวนั้น
  // "ผ่าน" filter หลักตั้งแต่แรกอยู่แล้ว (ตรวจสอบยอดตรงกันทุกเดือนย้อนหลังทั้งหมดแล้ว ไม่ใช่คนละยอด)
  // การดันรายการย่อยเข้าไปอีกจึงกลายเป็นนับซ้ำสอง — แก้จริงคือ: กันแถวสรุป key="misc" ออกจาก
  // filter หลัก (ดูด้านบน) แล้วใช้รายการย่อยจาก misc_items_json เป็นแหล่งเดียวทั้งยอดรวมและ
  // รายละเอียดที่แสดงในตาราง (เดิม data.miscExpenses ไม่มีใครอ่านฝั่ง client เลยด้วย)
  const miscExpenses: Array<{ name: string; amount: number; method: string; month: string }> = [];
  filteredRows
    .filter((r: any) => r.key === "misc_items_json" && r.name)
    .forEach((r: any) => {
      try {
        const arr = JSON.parse(r.name);
        if (Array.isArray(arr)) {
          arr.forEach((item: any, idx: number) => {
            const amt = Number(item.amount || 0);
            miscExpenses.push({
              name: item.name,
              amount: amt,
              method: item.method || "บัญชีร้าน",
              month: r.month,
            });
            if (amt > 0 && amt < 10000000) {
              totalOpex += amt;
              opexList.push({
                id: `${r.id}-misc-${idx}`,
                month: r.month,
                category: "ค่าใช้จ่ายเบ็ดเตล็ด",
                name: item.name,
                amount: amt,
                payMethod: item.method || "บัญชีร้าน",
                recordedBy: r.recorded_by || "Milo",
                key: `${r.key}-${idx}`,
              });
            }
          });
        }
      } catch (err) {
        // ข้ามแถวนี้แถวเดียว ไม่ให้ทั้งหน้าพัง แต่ log ไว้เพราะแปลว่ารายจ่ายบางรายการหายไปจาก
        // ยอดรวมเงียบๆ (id ของแถวช่วยตามไปดูใน sc_opex ได้)
        console.error(`[expenses] parse misc_items_json ล้มเหลว (row id=${r.id}):`, err);
      }
    });

  // Rental Income (Dormitory/Rooms) — category "rental_income" ถูกกรองออกจาก opexList ไปแล้วข้างบน
  // ตรงนี้ดึงมาแสดงแยกต่างหาก ไม่ปนกับค่าใช้จ่าย (ยังไม่มีข้อมูลเลขมิเตอร์ไฟ/ชื่อผู้เช่าจริงในตาราง
  // sc_opex ปัจจุบัน — ใส่ค่าว่าง/0 ไว้ก่อน ถ้าจะทำระบบมิเตอร์ไฟเต็มรูปแบบต้องเพิ่ม schema แยก)
  const rentals: RentalRecord[] = filteredRows
    .filter((r: any) => r.category === "rental_income")
    .map((r: any, idx: number) => ({
      roomId: idx,
      roomName: r.name || `ห้องเช่า ${idx + 1}`,
      tenantName: "",
      rentAmount: Number(r.amount || 0),
      prevMeter: 0,
      currMeter: 0,
      electricCost: 0,
      totalIncome: Number(r.amount || 0),
      month: r.month,
    }));
  const totalRentalIncome = rentals.reduce((sum, r) => sum + r.totalIncome, 0);

  return {
    timeRange,
    totalMonthlySales,
    totalPayroll,
    totalOpex,
    totalRentalIncome,
    netExpenses: totalOpex + totalPayroll,
    opexList,
    payslips,
    miscExpenses,
    rentals,
  };
}

/**
 * Save / update staff profile details and employment type
 */
/**
 * ปิดบังเลขบัตรประชาชน/เลขบัญชีก่อนเขียนลง audit log
 * audit ต้องบอกได้ว่า "มีการแก้ไขข้อมูลนี้" โดยไม่กลายเป็นแหล่งรวม PII เสียเอง
 */
function maskId(value: string | undefined | null): string {
  const raw = String(value ?? "").replace(/s|-/g, "");
  if (!raw) return "—";
  if (raw.length <= 4) return "*".repeat(raw.length);
  return "*".repeat(raw.length - 4) + raw.slice(-4);
}

export async function saveStaffProfileInfo(payload: {
  employeeKeyName: string;
  fullName: string;
  nickname: string;
  idCardNo: string;
  bankName: string;
  accountNo: string;
  employeeRole: string;
  employmentType: "monthly" | "probation_daily";
  baseSalary?: number;
  dailyWage?: number;
  daysWorked?: number;
  /** ยกเว้นประกันสังคม เช่น หุ้นส่วนผู้จัดการที่ไม่นับเป็นลูกจ้างตาม พ.ร.บ.ประกันสังคม */
  ssoExempt?: boolean;
}): Promise<ExpenseActionState> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  let cleanKeyName = payload.employeeKeyName;
  if (cleanKeyName.includes("ธีรภัทร")) cleanKeyName = "นายธีรภัทร ทาแผ";
  else if (cleanKeyName.includes("สุทธินันท์")) cleanKeyName = "น.ส.สุทธินันท์ นนทจันทร์";
  else if (cleanKeyName.includes("เจ")) cleanKeyName = "เจ";

  const profileData = {
    fullName: payload.fullName,
    nickname: payload.nickname,
    idCardNo: payload.idCardNo,
    bankName: payload.bankName,
    accountNo: payload.accountNo,
    employeeRole: payload.employeeRole,
    employmentType: payload.employmentType,
    baseSalary: payload.baseSalary || 12000,
    dailyWage: payload.dailyWage || 350,
    daysWorked: payload.daysWorked || 8,
    ssoExempt: !!payload.ssoExempt,
  };

  const key = `empd_profile_${cleanKeyName}`;

  // Delete existing profile entry
  await (supabase.from("sc_opex" as any) as any)
    .delete()
    .eq("key", key);

  // Insert updated profile entry
  await (supabase.from("sc_opex" as any) as any).insert({
    month: currentMonthMY(),
    category: "payslip_detail",
    key,
    name: JSON.stringify(profileData),
    amount: 0,
    pay_method: "-",
    recorded_by: profile.display_name,
    last_updated: new Date().toISOString(),
  });

  // Also update or insert in sc_employees table
  const { data: existingEmp } = await (supabase.from("sc_employees" as any) as any)
    .select("id")
    .ilike("name", `%${payload.nickname || cleanKeyName}%`)
    .maybeSingle();

  if (existingEmp) {
    await (supabase.from("sc_employees" as any) as any)
      .update({
        name: payload.fullName,
        nickname: payload.nickname,
        position: payload.employeeRole,
        bank: payload.bankName,
        account: payload.accountNo,
        salary: payload.employmentType === "monthly" ? payload.baseSalary || 12000 : (payload.dailyWage || 350) * 26,
        sso_exempt: payload.employmentType === "probation_daily" || !!payload.ssoExempt,
        last_updated: new Date().toISOString(),
      })
      .eq("id", existingEmp.id);
  }

  await logAudit({
    action: "UPDATE",
    entity: "roster_employee",
    entity_id: cleanKeyName,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: {
      employee: cleanKeyName,
      full_name: payload.fullName,
      nickname: payload.nickname,
      role: payload.employeeRole,
      employment_type: payload.employmentType,
      sso_exempt: !!payload.ssoExempt,
      base_salary: profileData.baseSalary,
      daily_wage: profileData.dailyWage,
      days_worked: profileData.daysWorked,
      bank: payload.bankName,
      account_no: maskId(payload.accountNo),
      id_card_no: maskId(payload.idCardNo),
    },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * Create a new staff member (e.g. 4th, 5th employee)
 */
export async function createStaffMember(payload: {
  fullName: string;
  nickname: string;
  idCardNo: string;
  bankName: string;
  accountNo: string;
  position: string;
  employmentType: "monthly" | "probation_daily";
  salary: number;
  /** ยกเว้นประกันสังคม เช่น หุ้นส่วนผู้จัดการที่ไม่นับเป็นลูกจ้างตาม พ.ร.บ.ประกันสังคม */
  ssoExempt?: boolean;
}): Promise<ExpenseActionState> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  if (!payload.fullName.trim()) {
    return { error: "กรุณาระบุชื่อพนักงาน" };
  }

  // 1. Insert into sc_employees
  const { error: empError } = await (supabase.from("sc_employees" as any) as any).insert({
    name: payload.fullName.trim(),
    nickname: payload.nickname.trim() || payload.fullName.trim(),
    position: payload.position.trim() || (payload.employmentType === "monthly" ? "พนักงานประจำ" : "พนักงานทดลองงาน"),
    bank: payload.bankName.trim() || "กสิกรไทย",
    account: payload.accountNo.trim() || "-",
    salary: payload.salary,
    status: "Active",
    comm_rate: 0,
    sso_exempt: payload.employmentType === "probation_daily" || !!payload.ssoExempt,
    last_updated: new Date().toISOString(),
  });

  if (empError) {
    return { error: "ไม่สามารถบันทึกพนักงานได้: " + empError.message };
  }

  // 2. Insert profile into sc_opex
  const profileData = {
    fullName: payload.fullName.trim(),
    nickname: payload.nickname.trim(),
    idCardNo: payload.idCardNo.trim(),
    bankName: payload.bankName.trim(),
    accountNo: payload.accountNo.trim(),
    employeeRole: payload.position.trim(),
    employmentType: payload.employmentType,
    baseSalary: payload.employmentType === "monthly" ? payload.salary : payload.salary * 8,
    dailyWage: payload.employmentType === "probation_daily" ? payload.salary : 350,
    daysWorked: 8,
    ssoExempt: !!payload.ssoExempt,
  };

  await (supabase.from("sc_opex" as any) as any).insert({
    month: currentMonthMY(),
    category: "payslip_detail",
    key: `empd_profile_${payload.fullName.trim()}`,
    name: JSON.stringify(profileData),
    amount: 0,
    pay_method: "-",
    recorded_by: profile.display_name,
    last_updated: new Date().toISOString(),
  });

  await logAudit({
    action: "CREATE",
    entity: "roster_employee",
    entity_id: payload.fullName.trim(),
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: {
      full_name: payload.fullName.trim(),
      nickname: payload.nickname.trim(),
      position: payload.position.trim(),
      employment_type: payload.employmentType,
      sso_exempt: !!payload.ssoExempt,
      salary: payload.salary,
      bank: payload.bankName.trim(),
      account_no: maskId(payload.accountNo),
      id_card_no: maskId(payload.idCardNo),
    },
  });

  revalidatePath("/", "layout");
  return { success: true };
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
  /** รายการหักย่อย เช่น "มาสาย", "ลากิจไม่แจ้งล่วงหน้า" — ถ้าใส่มา otherDeductions จะถูกคำนวณ
   * เป็นผลรวมของรายการเหล่านี้แทนที่จะใช้ค่า otherDeductions ตรงๆ */
  deductDetails?: Array<{ name: string; amount: number }>;
  netPay: number;
  payMethod: string;
}): Promise<ExpenseActionState> {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  const m = payload.month;
  let cleanKeyName = payload.employeeName;
  if (cleanKeyName.includes("ธีรภัทร")) cleanKeyName = "นายธีรภัทร ทาแผ";
  else if (cleanKeyName.includes("สุทธินันท์")) cleanKeyName = "น.ส.สุทธินันท์ นนทจันทร์";
  else if (cleanKeyName.includes("เจ")) cleanKeyName = "เจ";

  // ถ้ามีรายการหักย่อยส่งมา ยอดรวมต้องมาจากผลรวมของรายการเหล่านั้นเสมอ ไม่ใช่ payload.otherDeductions
  // ตรงๆ — กันกรณี client คำนวณผลรวมพลาดแล้วสองค่าไม่ตรงกัน (ตัวเลขในสองคีย์ sc_opex ต้องซิงค์กันเสมอ)
  const deductItems = (payload.deductDetails || []).filter((d) => d.name.trim() && d.amount > 0);
  const deductTotal = deductItems.length > 0
    ? deductItems.reduce((sum, d) => sum + Number(d.amount || 0), 0)
    : payload.otherDeductions;

  const keysToSave = [
    { key: `emp_${cleanKeyName}`, name: `เงินจ่ายพนักงาน: ${cleanKeyName}`, amount: payload.netPay, category: "ค่าแรงพนักงาน" },
    { key: `empd_base_sal_${cleanKeyName}`, name: `empd_base_sal_${cleanKeyName}: ${cleanKeyName}`, amount: payload.baseSalary, category: "payslip_detail" },
    { key: `empd_diligence_${cleanKeyName}`, name: `empd_diligence_${cleanKeyName}: ${cleanKeyName}`, amount: payload.diligence, category: "payslip_detail" },
    { key: `empd_ot_${cleanKeyName}`, name: `empd_ot_${cleanKeyName}: ${cleanKeyName}`, amount: payload.ot, category: "payslip_detail" },
    { key: `empd_comm_pct_${cleanKeyName}`, name: `empd_comm_pct_${cleanKeyName}: ${cleanKeyName}`, amount: payload.commPct, category: "payslip_detail" },
    { key: `empd_wht_${cleanKeyName}`, name: `empd_wht_${cleanKeyName}: ${cleanKeyName}`, amount: payload.wht, category: "payslip_detail" },
    { key: `empd_deduct_total_${cleanKeyName}`, name: `empd_deduct_total_${cleanKeyName}: ${cleanKeyName}`, amount: deductTotal, category: "payslip_detail" },
    { key: `empd_deduct_items_${cleanKeyName}`, name: JSON.stringify(deductItems), amount: 0, category: "payslip_detail" },
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

  // เขียนตัวเลขเงินเดือนทั้งชุดลง audit — ฟังก์ชันนี้ลบแถวเดิมแล้ว insert ทับ
  // ถ้าไม่บันทึกไว้ตรงนี้ ยอดเดิมจะหายไปโดยไม่มีร่องรอยเลย
  await logAudit({
    action: "UPDATE",
    entity: "payroll",
    entity_id: `${m}:${cleanKeyName}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: {
      month: m,
      employee: cleanKeyName,
      employment_type: payload.employmentType,
      base_salary: payload.baseSalary,
      diligence: payload.diligence,
      ot: payload.ot,
      commission_pct: payload.commPct,
      commission: payload.commission,
      wht: payload.wht,
      sso_deduction: payload.ssoDeduction,
      other_deductions: payload.otherDeductions,
      net_pay: payload.netPay,
      pay_method: payload.payMethod || "บัญชีร้าน",
    },
  });

  revalidatePath("/", "layout");
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

  const expenseKey = `custom_${Date.now()}`;
  const { data: inserted, error } = await (supabase.from("sc_opex" as any) as any)
    .insert({
      month: monthKey,
      category,
      name: title,
      amount,
      pay_method: payMethod,
      recorded_by: profile.display_name,
      key: expenseKey,
      last_updated: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return { error: `ไม่สามารถบันทึกได้: ${error.message}` };
  }

  await logAudit({
    action: "CREATE",
    entity: "expense",
    entity_id: inserted?.id ?? expenseKey,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { month: monthKey, category, name: title, amount, pay_method: payMethod, expense_date: expenseDate },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

export async function deleteExpense(id: string | number) {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  // อ่านรายการเก็บไว้ก่อนลบ — ยอดค่าใช้จ่ายที่หายไปต้องตรวจย้อนหลังได้
  const { data: doomed } = await (supabase.from("sc_opex" as any) as any)
    .select("month, category, key, name, amount, pay_method, recorded_by")
    .eq("id", id)
    .maybeSingle();

  const { error } = await (supabase.from("sc_opex" as any) as any)
    .delete()
    .eq("id", id);

  if (error) {
    throw new Error(`ไม่สามารถลบรายการได้: ${error.message}`);
  }

  await logAudit({
    action: "DELETE",
    entity: "expense",
    entity_id: String(id),
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: doomed
      ? { expense_id: id, ...doomed }
      : { expense_id: id, note: "อ่านข้อมูลเดิมไม่ได้ก่อนลบ" },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

/**
 * ลบรายการหนึ่งรายการออกจากรายจ่ายเบ็ดเตล็ด (misc_items_json)
 *
 * ทำไมต้องมี action แยก: หน้า /expenses แสดงรายการย่อยของ misc_items_json เป็นแถวๆ ในตาราง
 * ค่าใช้จ่าย (ดู fetchAllExpensesData) โดยใช้ id สังเคราะห์แบบ "${rowId}-misc-${itemIndex}"
 * เพราะรายการเหล่านี้ไม่มีแถว sc_opex ของตัวเอง — เป็นแค่ item หนึ่งตัวใน array JSON ที่เก็บรวมกัน
 * ในแถวเดียว ถ้าใช้ deleteExpense(id) ตรงๆ กับ id สังเคราะห์นี้จะพังทันที (id column เป็น bigint
 * ใส่ string แบบนี้เข้าไปไม่ได้) ต้อง "แก้ไข JSON แล้วเขียนทับ" แทนการลบทั้งแถว
 *
 * มีแถวคู่กันเสมอ: key="misc" (ยอดรวมก้อนเดียว) กับ key="misc_items_json" (รายละเอียด) สอง
 * แถวนี้ต้องมียอดตรงกันเสมอ (ดูคอมเมนต์ที่ fetchAllExpensesData) ฟังก์ชันนี้จึงต้องอัปเดตทั้งคู่
 */
export async function deleteMiscExpenseItem(rowId: number, itemIndex: number) {
  const profile = await requireProfile();
  const supabase = createAdminClient();

  const { data: row, error: fetchError } = await (supabase.from("sc_opex" as any) as any)
    .select("id, month, name")
    .eq("id", rowId)
    .eq("key", "misc_items_json")
    .maybeSingle();

  if (fetchError || !row) {
    throw new Error(`ไม่พบรายการรายจ่ายเบ็ดเตล็ดแถวนี้: ${fetchError?.message || "row not found"}`);
  }

  let items: Array<{ name: string; amount: number; method?: string }>;
  try {
    items = JSON.parse(row.name);
    if (!Array.isArray(items)) throw new Error("ข้อมูลไม่ใช่ array");
  } catch (err) {
    throw new Error(`อ่านข้อมูลรายจ่ายเบ็ดเตล็ดไม่สำเร็จ: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (itemIndex < 0 || itemIndex >= items.length) {
    throw new Error("ไม่พบรายการย่อยที่ตำแหน่งนี้ — ข้อมูลอาจถูกแก้ไปแล้วจากที่อื่น ลองรีเฟรชหน้าอีกครั้ง");
  }

  const removed = items[itemIndex];
  const nextItems = items.filter((_, i) => i !== itemIndex);
  const nextTotal = nextItems.reduce((sum, i) => sum + Number(i.amount || 0), 0);

  const { error: updateItemsError } = await (supabase.from("sc_opex" as any) as any)
    .update({ name: JSON.stringify(nextItems), last_updated: new Date().toISOString() })
    .eq("id", rowId);

  if (updateItemsError) {
    throw new Error(`ลบรายการไม่สำเร็จ: ${updateItemsError.message}`);
  }

  // ซิงค์แถวสรุป key="misc" ให้ยอดตรงกับ items ที่เหลือเสมอ
  await (supabase.from("sc_opex" as any) as any)
    .update({ amount: nextTotal, last_updated: new Date().toISOString() })
    .eq("month", row.month)
    .eq("key", "misc");

  await logAudit({
    action: "DELETE",
    entity: "expense",
    entity_id: `${rowId}-misc-${itemIndex}`,
    actor_id: profile.id,
    actor_name: profile.display_name,
    detail: { month: row.month, removed_item: removed, remaining_total: nextTotal },
  });

  revalidatePath("/", "layout");
  return { success: true };
}

