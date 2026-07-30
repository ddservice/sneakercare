import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { canManageStock } from '../lib/types';
import SubTabs, { type SubTabDef } from '../components/SubTabs';
import {
  IconArrowDownTray, IconArrowUpTray, IconClock, IconEdit, IconHistory, IconStock, IconTruck,
} from '../components/Icons';
import ItemsSection from './stock/ItemsSection';
import SuppliersSection from './stock/SuppliersSection';
import StockInForm from './stock/StockInForm';
import StockOutForm from './stock/StockOutForm';
import AdjustmentForm from './stock/AdjustmentForm';
import PurchaseHistorySection from './stock/PurchaseHistorySection';
import PendingApprovalsSection from './stock/PendingApprovalsSection';
import AuditLogSection from './stock/AuditLogSection';

type TabKey = 'items' | 'in' | 'out' | 'adjust' | 'pending' | 'history' | 'suppliers' | 'audit';

export default function Stock() {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);
  const [tab, setTab] = useState<TabKey>('items');

  const tabs: SubTabDef<TabKey>[] = [
    { key: 'items', label: 'รายการสินค้า', Icon: IconStock },
    ...(isManager ? [{ key: 'in' as const, label: 'รับเข้า', Icon: IconArrowDownTray }] : []),
    { key: 'out', label: 'เบิกใช้', Icon: IconArrowUpTray },
    { key: 'adjust', label: 'ปรับปรุงสต๊อก', Icon: IconEdit },
    ...(isManager ? [{ key: 'pending' as const, label: 'รออนุมัติ', Icon: IconClock }] : []),
    ...(isManager ? [{ key: 'history' as const, label: 'ประวัติซื้อเข้า', Icon: IconHistory }] : []),
    { key: 'suppliers', label: 'ซัพพลายเออร์', Icon: IconTruck },
    ...(isManager ? [{ key: 'audit' as const, label: 'Audit Log', Icon: IconHistory }] : []),
  ];

  return (
    <div>
      <SubTabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'items' && <ItemsSection />}
      {tab === 'in' && isManager && <StockInForm />}
      {tab === 'out' && <StockOutForm />}
      {tab === 'adjust' && <AdjustmentForm />}
      {tab === 'pending' && isManager && <PendingApprovalsSection />}
      {tab === 'history' && isManager && <PurchaseHistorySection />}
      {tab === 'suppliers' && <SuppliersSection />}
      {tab === 'audit' && isManager && <AuditLogSection />}
    </div>
  );
}
