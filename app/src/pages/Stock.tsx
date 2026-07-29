import { useAuth } from '../lib/AuthContext';
import { canManageStock } from '../lib/types';
import ItemsSection from './stock/ItemsSection';
import SuppliersSection from './stock/SuppliersSection';
import StockInForm from './stock/StockInForm';
import StockOutForm from './stock/StockOutForm';
import AdjustmentForm from './stock/AdjustmentForm';
import PurchaseHistorySection from './stock/PurchaseHistorySection';
import PendingApprovalsSection from './stock/PendingApprovalsSection';
import AuditLogSection from './stock/AuditLogSection';

export default function Stock() {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);

  return (
    <div>
      <p className="poc-note">
        ยังไม่ได้ย้าย: การกำหนดสิทธิ์ต่อ role แบบละเอียด (หน้าตั้งค่า) — ใช้ระบบเดิมสำหรับส่วนนี้ไปก่อน
      </p>
      <ItemsSection />
      {isManager && <StockInForm />}
      <StockOutForm />
      <AdjustmentForm />
      {isManager && <PendingApprovalsSection />}
      {isManager && <PurchaseHistorySection />}
      <SuppliersSection />
      {isManager && <AuditLogSection />}
    </div>
  );
}
