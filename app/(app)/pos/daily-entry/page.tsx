import { requireProfile } from "@/lib/auth";
import { countDailySales, fetchRecentDailySales } from "@/app/actions/daily-sales";
import { DailyEntryClient } from "./daily-entry-client";

export const dynamic = "force-dynamic";

/**
 * หน้านี้กรอง/ค้นหาทั้งหมดฝั่ง client จากชุดข้อมูลที่โหลดมารอบเดียว
 * จึงแบ่งหน้าแบบ /history ไม่ได้ตรงๆ — สิ่งที่ทำได้และต้องทำคือ "บอกให้รู้"
 * เมื่อข้อมูลจริงมีมากกว่าที่โหลดมา แทนที่จะตัดทิ้งเงียบๆ เหมือนเดิม
 */
const LOAD_LIMIT = 500;

export default async function DailyEntryPage() {
  await requireProfile();

  const [recentRecords, totalRecords] = await Promise.all([
    fetchRecentDailySales(LOAD_LIMIT),
    countDailySales(),
  ]);

  const truncated = totalRecords > recentRecords.length;

  return (
    <div className="space-y-3">
      {truncated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700/60 px-4 py-2.5 text-xs text-amber-900 dark:text-amber-200">
          ⚠️ แสดง <strong>{recentRecords.length.toLocaleString("th-TH")}</strong> รายการล่าสุด จากทั้งหมด{" "}
          <strong>{totalRecords.toLocaleString("th-TH")}</strong> รายการ — ตัวกรองและช่องค้นหาด้านล่างทำงาน
          เฉพาะกับรายการที่โหลดมาเท่านั้น หากต้องการดูย้อนหลังทั้งหมดให้ใช้หน้า{" "}
          <a href="/reports" className="underline font-semibold">
            รายงาน
          </a>
        </div>
      )}
      <DailyEntryClient initialRecords={recentRecords} />
    </div>
  );
}
