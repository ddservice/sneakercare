import { requireProfile } from "@/lib/auth";
import { fetchRecentDailySales } from "@/app/actions/daily-sales";
import { DailyEntryClient } from "./daily-entry-client";

export const dynamic = "force-dynamic";

export default async function DailyEntryPage() {
  await requireProfile();
  const recentRecords = await fetchRecentDailySales(500);

  return <DailyEntryClient initialRecords={recentRecords} />;
}
