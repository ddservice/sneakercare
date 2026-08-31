import { requireProfile } from "@/lib/auth";
import { fetchRecentDailySales } from "@/app/actions/daily-sales";
import { DailyEntryClient } from "./daily-entry-client";

export default async function DailyEntryPage() {
  await requireProfile();
  const recentRecords = await fetchRecentDailySales(50);

  return <DailyEntryClient initialRecords={recentRecords} />;
}
