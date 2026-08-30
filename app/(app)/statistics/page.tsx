import { requireProfile } from "@/lib/auth";
import { fetchAnalyticsData } from "@/app/actions/analytics";
import { StatisticsClient } from "./statistics-client";

export default async function StatisticsPage() {
  await requireProfile();
  const data = await fetchAnalyticsData("all");

  return <StatisticsClient initialData={data} />;
}
