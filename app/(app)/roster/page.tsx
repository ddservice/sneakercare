import { requireProfile, requireModuleView } from "@/lib/auth";
import { RosterClient } from "./roster-client";

export const metadata = {
  title: "ตารางการทำงาน & ปฏิทินกะพนักงาน | SneakerCare",
  description: "ระบบจัดตารางงาน กะเช้า กะสาย วันหยุดประจำสัปดาห์ และวันหยุดตามกฎหมายแรงงาน SneakerCare",
};

export default async function RosterPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "roster");
  return <RosterClient />;
}
