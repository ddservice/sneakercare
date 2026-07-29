import { useAuth } from '../lib/AuthContext';
import { canManageStock, isAdmin } from '../lib/types';
import BizProfileSection from './settings/BizProfileSection';
import SizePricesSection from './settings/SizePricesSection';
import TelegramSection from './settings/TelegramSection';
import RoomsConfigSection from './settings/RoomsConfigSection';
import RolePermissionsSection from './settings/RolePermissionsSection';
import DataPurgeSection from './settings/DataPurgeSection';
import UserManagementSection from './settings/UserManagementSection';

export default function Settings() {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);

  if (!isManager) {
    return <div className="card"><p className="poc-note">แท็บนี้สำหรับ Admin/Co-Admin เท่านั้น</p></div>;
  }

  return (
    <div>
      <BizProfileSection />
      <SizePricesSection />
      <TelegramSection />
      <RoomsConfigSection />
      <DataPurgeSection />
      {/* ทั้งสองส่วนนี้ต้อง admin-only แบบ hardcode เสมอ ห้ามผ่านระบบ checkbox ui_permissions เด็ดขาด
          จัดการผู้ใช้/สิทธิ์คือทางเดียวที่ Co-Admin ต่างจาก Admin จริงๆ ในระบบนี้ — ถ้าปล่อยให้ Co-Admin
          ปลดล็อกเมนูนี้ให้ตัวเองได้ผ่าน Role Permissions จะกลายเป็น privilege escalation ทันที */}
      {isAdmin(auth?.role) && <RolePermissionsSection />}
      {isAdmin(auth?.role) && <UserManagementSection />}
    </div>
  );
}
