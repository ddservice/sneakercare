import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { canManageStock } from '../lib/types';
import { useTheme } from '../lib/useTheme';

const TABS = [
  { path: '/', label: 'ภาพรวม' },
  { path: '/sales', label: 'งานบริการ/ยอดขาย' },
  { path: '/stock', label: 'คลังสินค้า' },
  { path: '/opex', label: 'ค่าใช้จ่าย & พนักงาน' },
  { path: '/stats', label: 'สถิติ' },
];

export default function Layout() {
  const { auth, logout } = useAuth();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const closeNav = () => setNavOpen(false);

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <span className="app-title">SneakerCare</span>
        <button
          type="button"
          className="nav-toggle"
          aria-label="เปิด/ปิดเมนู"
          onClick={() => setNavOpen((v) => !v)}
        >
          {navOpen ? '✕' : '☰'}
        </button>
        <nav className={'app-tabs' + (navOpen ? ' open' : '')}>
          {TABS.map((t) => (
            <NavLink key={t.path} to={t.path} end={t.path === '/'} className={({ isActive }) => 'tab' + (isActive ? ' on' : '')} onClick={closeNav}>
              {t.label}
            </NavLink>
          ))}
          {canManageStock(auth?.role) && (
            <NavLink to="/settings" className={({ isActive }) => 'tab' + (isActive ? ' on' : '')} onClick={closeNav}>
              ตั้งค่า
            </NavLink>
          )}
        </nav>
        <div className="app-user">
          <span className={'role-chip' + (auth?.role === 'admin' ? ' admin' : auth?.role === 'co-admin' ? ' co-admin' : '')}>
            {auth?.role === 'admin' ? 'Admin' : auth?.role === 'co-admin' ? 'Co-Admin' : 'Manager'}
          </span>
          <span>{auth?.displayName}</span>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            title={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button onClick={doLogout}>ออกจากระบบ</button>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
