import { requireProfile, requireModuleView } from "@/lib/auth";
import { RosterClient } from "./roster-client";

export const metadata = {
  title: "ตารางการทำงาน & ปฏิทินกะพนักงาน | DD-Management",
  description: "ระบบจัดตารางงาน กะเช้า กะสาย วันหยุดประจำสัปดาห์ และวันหยุดตามกฎหมายแรงงาน DD-Management",
};

export default async function RosterPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "roster");
  return <RosterClient />;
}
