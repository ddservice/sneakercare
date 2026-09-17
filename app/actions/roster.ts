"use server";

// ✅ [multi-tenant 2026-09-17] แทนที่รายชื่อพนักงานที่ hardcode ไว้ใน roster-client.tsx เดิม
// (เชียง/มิ้ว/เจ ของ tenant #1 ตรงๆ ในโค้ด — เปิดให้ tenant อื่นใช้ /roster ไม่ได้เลย) ด้วยการ
// ดึงจาก sc_employees จริงของแต่ละ tenant (migration 0037) — ทุก query กรอง tenant_id ตาม
// tenantFilter()/requireTenantId() เหมือนไฟล์ server action อื่นที่ใช้ service_role ทั้งหมด
import { revalidatePath } from "next/cache";
import { requireProfile, requireModuleView, requireModuleWrite } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSelectedBranchId } from "@/lib/branch";
import { requireTenantId, tenantFilter } from "@/lib/tenant";

export type RosterStaff = {
  id: number;
  name: string;
  nickname: string;
  position: string;
  employmentType: "monthly" | "probation_daily";
  /** เงินเดือน (monthly) หรือค่าจ้างรายวัน (probation_daily) แล้วแต่ employmentType */
  wage: number;
  defaultShift: "morning" | "late";
  defaultDayOff: number | null;
  bonusPerPair: number;
};

/** พนักงานที่ยังทำงานอยู่ของ tenant ตัวเอง สำหรับหน้า /roster — ดึงจาก sc_employees จริง
 * แทนรายชื่อที่ hardcode ไว้เดิม */
export async function fetchRosterStaff(): Promise<RosterStaff[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "roster");
  const supabase = createAdminClient();

  let query = supabase
    .from("sc_employees")
    .select("id, name, nickname, position, salary, default_shift, default_day_off, bonus_per_pair, status");
  const tenantId = await tenantFilter(profile);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query.order("id", { ascending: true });
  if (error || !data) return [];

  return data
    .filter((e) => (e.status ?? "Active").toLowerCase() !== "inactive")
    .map((e) => {
      const salary = Number(e.salary ?? 0);
      const isProbation = (e.position ?? "").includes("ทดลองงาน") || (salary > 0 && salary < 1000);
      return {
        id: e.id,
        name: e.name,
        nickname: e.nickname || e.name,
        position: e.position || (isProbation ? "พนักงานทดลองงาน" : "พนักงานประจำ"),
        employmentType: isProbation ? "probation_daily" : "monthly",
        wage: salary || (isProbation ? 350 : 12000),
        defaultShift: e.default_shift === "late" ? "late" : "morning",
        defaultDayOff: e.default_day_off,
        bonusPerPair: Number(e.bonus_per_pair ?? 0),
      };
    });
}

/** ตั้งค่ากะ/วันหยุดมาตรฐาน + อัตราโบนัสต่อคู่ ของพนักงานคนหนึ่ง (admin/co-admin เท่านั้น) */
export async function updateEmployeeRosterDefaults(
  employeeId: number,
  data: { defaultShift: "morning" | "late"; defaultDayOff: number | null; bonusPerPair: number }
) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "roster");
  const supabase = createAdminClient();
  const tenantId = await requireTenantId(profile);

  const { error, data: updated } = await supabase
    .from("sc_employees")
    .update({
      default_shift: data.defaultShift,
      default_day_off: data.defaultDayOff,
      bonus_per_pair: data.bonusPerPair,
    })
    .eq("id", employeeId)
    .eq("tenant_id", tenantId)
    .select("id");

  if (error) throw new Error(`บันทึกค่ากะมาตรฐานไม่สำเร็จ: ${error.message}`);
  if (!updated || updated.length === 0) {
    throw new Error("ไม่พบพนักงานนี้ในระบบของคุณ — อาจถูกลบหรือเป็นของ tenant อื่น");
  }

  revalidatePath("/roster");
  return { success: true };
}

export type StaffDailyStat = {
  id: number;
  employeeName: string;
  statDate: string;
  attendanceStatus: "normal" | "absent" | "leave" | "late";
  lateMinutes: number | null;
  otHours: number | null;
  pairsHandled: number | null;
  note: string | null;
};

/** บันทึกรายวันของพนักงานทุกคนในเดือนที่ระบุ (YYYY-MM) — ใช้แสดงในปฏิทินและคำนวณสรุปยอดเดือน */
export async function fetchStaffDailyStats(yearMonth: string): Promise<StaffDailyStat[]> {
  const profile = await requireProfile();
  requireModuleView(profile, "roster");
  const supabase = createAdminClient();

  let query = supabase
    .from("sc_staff_daily_stats")
    .select("id, employee_name, stat_date, attendance_status, late_minutes, ot_hours, pairs_handled, note")
    .gte("stat_date", `${yearMonth}-01`)
    .lte("stat_date", `${yearMonth}-31`);
  const tenantId = await tenantFilter(profile);
  if (tenantId) query = query.eq("tenant_id", tenantId);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    employeeName: r.employee_name,
    statDate: r.stat_date,
    attendanceStatus: (r.attendance_status ?? "normal") as StaffDailyStat["attendanceStatus"],
    lateMinutes: r.late_minutes,
    otHours: r.ot_hours,
    pairsHandled: r.pairs_handled,
    note: r.note,
  }));
}

/** บันทึก/แก้ไขข้อมูลวันเดียวของพนักงานคนหนึ่ง (upsert) — admin/co-admin เท่านั้น */
export async function saveStaffDailyStat(
  employeeName: string,
  statDate: string,
  data: {
    attendanceStatus: "normal" | "absent" | "leave" | "late";
    lateMinutes?: number | null;
    otHours?: number | null;
    pairsHandled?: number | null;
    note?: string | null;
  }
) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "roster");
  const supabase = createAdminClient();
  const tenantId = await requireTenantId(profile);

  const { error } = await supabase.from("sc_staff_daily_stats").upsert(
    {
      tenant_id: tenantId,
      employee_name: employeeName,
      stat_date: statDate,
      attendance_status: data.attendanceStatus,
      late_minutes: data.lateMinutes ?? null,
      ot_hours: data.otHours ?? null,
      pairs_handled: data.pairsHandled ?? null,
      note: data.note ?? null,
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id,employee_name,stat_date" }
  );

  if (error) throw new Error(`บันทึกข้อมูลรายวันไม่สำเร็จ: ${error.message}`);

  revalidatePath("/roster");
  revalidatePath("/expenses");
  return { success: true };
}

/** สรุปยอดรายเดือนต่อพนักงาน (ใช้ตอนคำนวณเงินเดือน — auto-fill OT + โบนัสจำนวนคู่) */
export async function fetchStaffMonthlyStatSummary(yearMonth: string) {
  // การ์ดตรงนี้ซ้ำกับที่มีอยู่แล้วใน fetchStaffDailyStats() ที่เรียกด้านล่าง (ซึ่งห่อด้วย cache()
  // ของ requireProfile จึงไม่เสียรอบ query เพิ่ม) — ใส่ไว้ตรงนี้ด้วยเพราะ npm run test:guards
  // ตรวจแบบ static เห็นแค่การ์อยู่ในฟังก์ชันเดียวกัน ไม่ไล่ตามการเรียกซ้อนฟังก์ชันอื่น
  const profile = await requireProfile();
  requireModuleView(profile, "roster");
  const stats = await fetchStaffDailyStats(yearMonth);
  const summary: Record<
    string,
    { absentDays: number; leaveDays: number; lateDays: number; totalOtHours: number; totalPairs: number }
  > = {};

  for (const s of stats) {
    if (!summary[s.employeeName]) {
      summary[s.employeeName] = { absentDays: 0, leaveDays: 0, lateDays: 0, totalOtHours: 0, totalPairs: 0 };
    }
    const row = summary[s.employeeName];
    if (s.attendanceStatus === "absent") row.absentDays += 1;
    else if (s.attendanceStatus === "leave") row.leaveDays += 1;
    else if (s.attendanceStatus === "late") row.lateDays += 1;
    row.totalOtHours += Number(s.otHours ?? 0);
    row.totalPairs += Number(s.pairsHandled ?? 0);
  }

  return summary;
}

export async function fetchSelectedShopHours(): Promise<{
  openTime: string;
  closeTime: string;
  branchName: string | null;
}> {
  const profile = await requireProfile();
  requireModuleView(profile, "roster");
  const branchId = await getSelectedBranchId(profile);
  if (!branchId) {
    return { openTime: "09:00", closeTime: "20:00", branchName: null };
  }
  const supabase = createAdminClient();
  const withHours = await supabase
    .from("inv_branches")
    .select("name, open_time, close_time")
    .eq("id", branchId)
    .maybeSingle();
  if (!withHours.error && withHours.data) {
    const row = withHours.data as { name: string; open_time?: string | null; close_time?: string | null };
    return {
      openTime: row.open_time || "09:00",
      closeTime: row.close_time || "20:00",
      branchName: row.name,
    };
  }
  const fallback = await supabase.from("inv_branches").select("name").eq("id", branchId).maybeSingle();
  return { openTime: "09:00", closeTime: "20:00", branchName: fallback.data?.name ?? null };
}

export async function applyGeneratedDayOffs(assignments: { employeeId: number; dayOff: number }[]) {
  const profile = await requireProfile();
  requireModuleWrite(profile, "roster");
  const tenantId = await requireTenantId(profile);
  const supabase = createAdminClient();

  for (const row of assignments) {
    if (row.dayOff < 0 || row.dayOff > 6) continue;
    const { error } = await supabase
      .from("sc_employees")
      .update({ default_day_off: row.dayOff })
      .eq("id", row.employeeId)
      .eq("tenant_id", tenantId);
    if (error) throw new Error(`จัดเวรไม่สำเร็จ: ${error.message}`);
  }

  revalidatePath("/roster");
  return { success: true as const };
}
