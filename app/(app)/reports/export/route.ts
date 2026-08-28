import { requireProfile, requireModuleView } from "@/lib/auth";
import { getActiveBranches, getSelectedBranchId } from "@/lib/branch";
import { fetchMonthlyCogs, formatMonthLabel, resolveMonthRange, toCsv } from "@/lib/reports";

// ดาวน์โหลด COGS รายเดือนเป็น CSV
//
// สำคัญ: route นี้บังคับสิทธิ์ชุดเดียวกับหน้า /reports เป๊ะ (requireProfile → requireModuleView)
// และ query ผ่าน createClient() ที่ผูกกับคุกกี้ของผู้ใช้ ทำให้ RLS + fn_current_role() ใน
// v_monthly_cogs ยังทำงานเต็มที่ — Staff ยิง URL นี้ตรงๆ ก็ถูกเด้งกลับ /dashboard และต่อให้
// หลุดมาได้ view ก็คืน 0 แถวอยู่ดี ห้ามเปลี่ยนไปใช้ admin client (service_role) ที่นี่เด็ดขาด
export async function GET(request: Request) {
  const profile = await requireProfile();
  requireModuleView(profile, "reports");
  const branchId = await getSelectedBranchId(profile);

  const url = new URL(request.url);
  const range = resolveMonthRange(
    url.searchParams.get("from") ?? undefined,
    url.searchParams.get("to") ?? undefined
  );

  const { rows } = await fetchMonthlyCogs(range, branchId);

  const branches = branchId ? [] : await getActiveBranches();
  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  const headers = branchId
    ? ["เดือน", "ต้นทุนรวม (บาท)"]
    : ["เดือน", "สาขา", "ต้นทุนรวม (บาท)"];

  const body = rows.map((row) => {
    const cogs = Number(row.cogs ?? 0).toFixed(2);
    return branchId
      ? [formatMonthLabel(row.month), cogs]
      : [formatMonthLabel(row.month), branchName.get(row.branch_id) ?? "—", cogs];
  });

  const filename = `cogs-${range.from}-ถึง-${range.to}.csv`;

  return new Response(toCsv(headers, body), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // ชื่อไฟล์เป็นภาษาไทย ต้องใช้ filename* (RFC 5987) ไม่งั้นเบราว์เซอร์ตั้งชื่อเป็นตัวขยะ
      "Content-Disposition": `attachment; filename="cogs-${range.from}_${range.to}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      // รายงานต้นทุนเป็นข้อมูลต่อผู้ใช้ ห้ามให้ proxy/CDN ใดๆ แคชไว้แจกคนอื่น
      "Cache-Control": "no-store, private",
    },
  });
}
