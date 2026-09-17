import { requireProfile, requireModuleView } from "@/lib/auth";
import { fetchRosterStaff, fetchSelectedShopHours } from "@/app/actions/roster";
import { canWrite } from "@/lib/permissions";
import { RosterClient } from "./roster-client";

export const metadata = {
  title: "ตารางการทำงาน & ปฏิทินกะพนักงาน | DD-Management",
  description: "ระบบจัดตารางงาน กะเช้า กะสาย วันหยุดประจำสัปดาห์ และวันหยุดตามกฎหมายแรงงาน DD-Management",
};

export default async function RosterPage() {
  const profile = await requireProfile();
  requireModuleView(profile, "roster");
  const staff = await fetchRosterStaff();
  const shopHours = await fetchSelectedShopHours();
  return (
    <RosterClient
      initialStaff={staff}
      shopHours={shopHours}
      canGenerate={canWrite(profile.role, "roster")}
    />
  );
}
