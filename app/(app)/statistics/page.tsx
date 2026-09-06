import { requireProfile, requireModuleView } from "@/lib/auth";
import { fetchAnalyticsData } from "@/app/actions/analytics";
import { StatisticsClient } from "./statistics-client";

export default async function StatisticsPage() {
  const profile = await requireProfile();
  // สถิติยอดขาย/กำไรย้อนหลังทั้งร้าน
  requireModuleView(profile, "statistics");
  const data = await fetchAnalyticsData("all");

  return <StatisticsClient initialData={data} />;
}
