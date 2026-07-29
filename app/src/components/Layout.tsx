import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

const TABS = [
  { path: '/', label: 'ภาพรวม', icon: 'ti-chart-bar' },
  { path: '/sales', label: 'งานบริการ/ยอดขาย', icon: 'ti-cash' },
  { path: '/stock', label: 'คลังสินค้า', icon: 'ti-package' },
  { path: '/opex', label: 'ค่าใช้จ่าย & พนักงาน', icon: 'ti-building-store' },
  { path: '/stats', label: 'สถิติ', icon: 'ti-chart-dots' },
];

export default function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-title">SneakerCare</span>
        <nav className="app-tabs">
          {TABS.map((t) => (
            <NavLink key={t.path} to={t.path} end={t.path === '/'} className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}>
              {t.label}
            </NavLink>
          ))}
          {auth?.role === 'admin' && (
            <NavLink to="/settings" className={({ isActive }) => 'tab' + (isActive ? ' on' : '')}>
              ตั้งค่า
            </NavLink>
          )}
        </nav>
        <div className="app-user">
          <span className={'role-chip' + (auth?.role === 'admin' ? ' admin' : auth?.role === 'co-admin' ? ' co-admin' : '')}>
            {auth?.role === 'admin' ? 'Admin' : auth?.role === 'co-admin' ? 'Co-Admin' : 'Manager'}
          </span>
          <span>{auth?.displayName}</span>
          <button onClick={doLogout}>ออกจากระบบ</button>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
