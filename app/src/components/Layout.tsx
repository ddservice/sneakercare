import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { canManageStock } from '../lib/types';
import { useTheme } from '../lib/useTheme';
import { IconLogout, IconOpex, IconOverview, IconSales, IconSettings, IconStats, IconStock } from './Icons';

const TABS = [
  { path: '/', label: 'ภาพรวม', Icon: IconOverview },
  { path: '/sales', label: 'งานบริการ/ยอดขาย', Icon: IconSales },
  { path: '/stock', label: 'คลังสินค้า', Icon: IconStock },
  { path: '/opex', label: 'ค่าใช้จ่าย & พนักงาน', Icon: IconOpex },
  { path: '/stats', label: 'สถิติ', Icon: IconStats },
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
      {navOpen && <div className="nav-backdrop" onClick={closeNav} />}
      <header className="app-topbar">
        <span className="app-title">SneakerCare</span>
        <nav className={'app-tabs' + (navOpen ? ' open' : '')}>
          {TABS.map((t) => (
            <NavLink key={t.path} to={t.path} end={t.path === '/'} className={({ isActive }) => 'tab' + (isActive ? ' on' : '')} onClick={closeNav}>
              <t.Icon className="tab-icon" />
              <span>{t.label}</span>
            </NavLink>
          ))}
          {canManageStock(auth?.role) && (
            <NavLink to="/settings" className={({ isActive }) => 'tab' + (isActive ? ' on' : '')} onClick={closeNav}>
              <IconSettings className="tab-icon" />
              <span>ตั้งค่า</span>
            </NavLink>
          )}
          <div className="app-user">
            <span className={'role-chip' + (auth?.role === 'admin' ? ' admin' : auth?.role === 'co-admin' ? ' co-admin' : '')}>
              {auth?.role === 'admin' ? 'Admin' : auth?.role === 'co-admin' ? 'Co-Admin' : 'Manager'}
            </span>
            <span className="app-user-name">{auth?.displayName}</span>
            <button onClick={doLogout}>
              <IconLogout width={16} height={16} />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        </nav>
        <div className="topbar-icons">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
            title={theme === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            type="button"
            className="nav-toggle"
            aria-label="เปิด/ปิดเมนู"
            onClick={() => setNavOpen((v) => !v)}
          >
            {navOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
