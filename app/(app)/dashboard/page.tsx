import { requireProfile, requireModuleView } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch";
import { DashboardClient } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "dashboard");
  const supabase = await createClient();

  // ⚠️ [แก้บั๊กจริง 2026-09-17] เดิมหน้านี้ไม่กรอง tenant/branch เองเลย พึ่ง RLS อย่างเดียว —
  // ใช้ได้ปกติกับ admin ทั่วไป (RLS บังคับให้เห็นแค่ tenant ตัวเองอยู่แล้วไม่ว่าจะเลือกสาขาไหน)
  // แต่ super_admin RLS อนุญาตให้เห็นทุก tenant เสมอ ⇒ เลือกสาขาของ LUXSU ในตัวเลือกสาขาบนหัวเว็บ
  // แล้วหน้านี้ยังโชว์ตัวเลขของ tenant #1 เหมือนเดิมทุกครั้ง (พิสูจน์แล้วว่าไม่กรองจริง)
  // แก้โดยกรองด้วย tenant ของสาขาที่เลือกเฉพาะ super_admin เท่านั้น — ถ้าไม่เลือกสาขา (ดูรวม)
  // ยังคงเห็นภาพรวมข้ามทุก tenant ต่อไปเหมือนเดิม (ตรงกับหลักการเดียวกับ badge สต๊อกต่ำใน layout.tsx)
  const selectedBranchId = await getSelectedBranchId(profile);
  let superAdminTenantId: string | null = null;
  let superAdminBranchIds: string[] | null = null;
  if (profile.role === "super_admin" && selectedBranchId) {
    const { data: branchRow } = await supabase
      .from("branches")
      .select("tenant_id")
      .eq("id", selectedBranchId)
      .maybeSingle();
    superAdminTenantId = branchRow?.tenant_id ?? null;
    if (superAdminTenantId) {
      const { data: tenantBranches } = await supabase
        .from("branches")
        .select("id")
        .eq("tenant_id", superAdminTenantId);
      superAdminBranchIds = (tenantBranches ?? []).map((b) => b.id).filter((id): id is string => !!id);
    }
  }

  // Fetch real sales, opex, payments, orders, items, and low-stock items
  let salesQuery = supabase.from("sc_sales").select("*").order("date", { ascending: false });
  let opexQuery = supabase.from("sc_opex").select("*").order("month", { ascending: false });
  let paymentsQuery = supabase.from("sc_payments").select("*").order("sale_date", { ascending: false });
  let ordersQuery = supabase.from("service_orders").select("*").order("received_at", { ascending: false });
  let itemsQuery = supabase.from("items").select("id, name, item_stock(*)").order("name");
  let lowStockQuery = supabase.from("v_low_stock").select("*");
  // ขั้นที่ 4 ของ docs/sc-opex-refactor-plan.md — ฝั่ง OPEX อ่านจากตารางใหม่
  // (เงินเดือน/ห้องเช่ายังมาจาก sc_opex จนกว่าจะถึงขั้นที่ 5)
  let expenseEntriesQuery = supabase
    .from("sc_expense_entries")
    .select("id, entry_date, amount, category, title, pay_method, legacy_ref");

  if (superAdminTenantId) {
    salesQuery = salesQuery.eq("tenant_id", superAdminTenantId);
    opexQuery = opexQuery.eq("tenant_id", superAdminTenantId);
    paymentsQuery = paymentsQuery.eq("tenant_id", superAdminTenantId);
    ordersQuery = ordersQuery.eq("tenant_id", superAdminTenantId);
    itemsQuery = itemsQuery.eq("tenant_id", superAdminTenantId);
    expenseEntriesQuery = expenseEntriesQuery.eq("tenant_id", superAdminTenantId);
    // v_low_stock ไม่มีคอลัมน์ tenant_id (เป็น view ที่ join item_stock/items) — กรองผ่าน
    // branch_id ของสาขาทั้งหมดใน tenant นั้นแทน (รูปแบบเดียวกับ badge สต๊อกต่ำใน layout.tsx)
    lowStockQuery = lowStockQuery.in(
      "branch_id",
      superAdminBranchIds && superAdminBranchIds.length > 0
        ? superAdminBranchIds
        : ["00000000-0000-0000-0000-000000000000"]
    );
  }

  const [
    { data: salesRows },
    { data: opexRows },
    { data: paymentsRows },
    { data: orders },
    { data: stockItems },
    { data: lowStock },
    { data: expenseEntries },
  ] = await Promise.all([
    salesQuery,
    opexQuery,
    paymentsQuery,
    ordersQuery,
    itemsQuery,
    lowStockQuery,
    expenseEntriesQuery,
  ]);

  return (
    <DashboardClient
      salesRows={salesRows || []}
      opexRows={opexRows || []}
      paymentsRows={paymentsRows || []}
      orders={orders || []}
      stockItems={stockItems || []}
      lowStock={lowStock || []}
      expenseEntries={expenseEntries || []}
    />
  );
}
