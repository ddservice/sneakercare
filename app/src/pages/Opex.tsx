import { useAuth } from '../lib/AuthContext';
import { canManageStock } from '../lib/types';
import OpexFixedSection from './opex/OpexFixedSection';
import PayrollSection from './opex/PayrollSection';
import RentalIncomeSection from './opex/RentalIncomeSection';
import EmployeesSection from './opex/EmployeesSection';
import OpexHistorySection from './opex/OpexHistorySection';

export default function Opex() {
  const { auth } = useAuth();
  const isManager = canManageStock(auth?.role);

  if (!isManager) {
    return <div className="card"><p className="poc-note">แท็บนี้สำหรับ Admin/Co-Admin เท่านั้น</p></div>;
  }

  return (
    <div>
      <OpexFixedSection />
      <PayrollSection />
      <RentalIncomeSection />
      <EmployeesSection />
      <OpexHistorySection />
    </div>
  );
}
