import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { canManageStock } from '../lib/types';
import SubTabs, { type SubTabDef } from '../components/SubTabs';
import { IconHistory, IconHome, IconOpex, IconUsers } from '../components/Icons';
import OpexFixedSection from './opex/OpexFixedSection';
import PayrollSection from './opex/PayrollSection';
import RentalIncomeSection from './opex/RentalIncomeSection';
import EmployeesSection from './opex/EmployeesSection';
import OpexHistorySection from './opex/OpexHistorySection';

type TabKey = 'fixed' | 'payroll' | 'rental' | 'employees' | 'history';

const TABS: SubTabDef<TabKey>[] = [
  { key: 'fixed', label: 'ค่าใช้จ่ายคงที่', Icon: IconOpex },
  { key: 'payroll', label: 'เงินเดือน', Icon: IconUsers },
  { key: 'rental', label: 'รายรับห้องเช่า', Icon: IconHome },
  { key: 'employees', label: 'รายชื่อพนักงาน', Icon: IconUsers },
  { key: 'history', label: 'ประวัติ', Icon: IconHistory },
];

export default function Opex() {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);
  const [tab, setTab] = useState<TabKey>('fixed');

  if (!isManager) {
    return <div className="card"><p className="poc-note">แท็บนี้สำหรับ Admin/Co-Admin เท่านั้น</p></div>;
  }

  return (
    <div>
      <SubTabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'fixed' && <OpexFixedSection />}
      {tab === 'payroll' && <PayrollSection />}
      {tab === 'rental' && <RentalIncomeSection />}
      {tab === 'employees' && <EmployeesSection />}
      {tab === 'history' && <OpexHistorySection />}
    </div>
  );
}
