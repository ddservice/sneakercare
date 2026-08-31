import { requireProfile } from "@/lib/auth";
import { RosterClient } from "./roster-client";

export const metadata = {
  title: "ตารางการทำงาน & ปฏิทินกะพนักงาน | SneakerCare",
  description: "ระบบจัดตารางงาน กะเช้า กะสาย วันหยุดประจำสัปดาห์ และวันหยุดตามกฎหมายแรงงาน SneakerCare",
};

export default async function RosterPage() {
  await requireProfile();
  return <RosterClient />;
}
