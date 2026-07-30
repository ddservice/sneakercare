import { lazy, Suspense, useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { canManageStock, isAdmin } from '../lib/types';
import SubTabs, { type SubTabDef } from '../components/SubTabs';
import {
  IconBell, IconFile, IconHome, IconOpex, IconShield, IconStats, IconTrash, IconUsers,
} from '../components/Icons';
import BizProfileSection from './settings/BizProfileSection';
import SizePricesSection from './settings/SizePricesSection';
import TelegramSection from './settings/TelegramSection';
import RoomsConfigSection from './settings/RoomsConfigSection';
import RolePermissionsSection from './settings/RolePermissionsSection';
import DataPurgeSection from './settings/DataPurgeSection';
import UserManagementSection from './settings/UserManagementSection';

// โหลดแยก chunk ต่างหาก — ไลบรารี xlsx หนักเกือบ 500KB ไม่ควรส่งให้ทุกคนโหลดตั้งแต่แรก
// ทั้งที่ฟีเจอร์นี้ใช้ไม่บ่อย (นำเข้าข้อมูล Excel เป็นครั้งคราวเท่านั้น)
const ImportExportSection = lazy(() => import('./settings/ImportExportSection'));

type TabKey = 'biz' | 'prices' | 'telegram' | 'rooms' | 'purge' | 'import' | 'roles' | 'users';

export default function Settings() {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);
  const admin = isAdmin(auth?.role);
  const [tab, setTab] = useState<TabKey>('biz');

  if (!isManager) {
    return <div className="card"><p className="poc-note">แท็บนี้สำหรับ Admin/Co-Admin เท่านั้น</p></div>;
  }

  const tabs: SubTabDef<TabKey>[] = [
    { key: 'biz', label: 'ข้อมูลร้าน', Icon: IconHome },
    { key: 'prices', label: 'ราคาตามไซส์', Icon: IconStats },
    { key: 'telegram', label: 'แจ้งเตือน Telegram', Icon: IconBell },
    { key: 'rooms', label: 'ตั้งค่าห้องเช่า', Icon: IconOpex },
    { key: 'purge', label: 'ล้างข้อมูล', Icon: IconTrash },
    { key: 'import', label: 'นำเข้า/ส่งออกข้อมูล', Icon: IconFile },
    // สองส่วนนี้ต้อง admin-only แบบ hardcode เสมอ ห้ามผ่านระบบ checkbox ui_permissions เด็ดขาด
    // จัดการผู้ใช้/สิทธิ์คือทางเดียวที่ Co-Admin ต่างจาก Admin จริงๆ ในระบบนี้ — ถ้าปล่อยให้ Co-Admin
    // ปลดล็อกเมนูนี้ให้ตัวเองได้ผ่าน Role Permissions จะกลายเป็น privilege escalation ทันที
    ...(admin ? [{ key: 'roles' as const, label: 'สิทธิ์การใช้งาน', Icon: IconShield }] : []),
    ...(admin ? [{ key: 'users' as const, label: 'จัดการผู้ใช้', Icon: IconUsers }] : []),
  ];

  return (
    <div>
      <SubTabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'biz' && <BizProfileSection />}
      {tab === 'prices' && <SizePricesSection />}
      {tab === 'telegram' && <TelegramSection />}
      {tab === 'rooms' && <RoomsConfigSection />}
      {tab === 'purge' && <DataPurgeSection />}
      {tab === 'import' && (
        <Suspense fallback={<div className="card section-gap"><p>กำลังโหลด...</p></div>}>
          <ImportExportSection />
        </Suspense>
      )}
      {tab === 'roles' && admin && <RolePermissionsSection />}
      {tab === 'users' && admin && <UserManagementSection />}
    </div>
  );
}
