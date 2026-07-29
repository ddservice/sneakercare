import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import RequireAuth from './components/RequireAuth';
import Layout from './components/Layout';
import { AuthProvider } from './lib/AuthContext';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';

// แต่ละแท็บแยก chunk ของตัวเอง — โหลดครั้งแรกไม่ต้องดึงโค้ดของทุกแท็บมาพร้อมกันทั้งหมด
const Overview = lazy(() => import('./pages/Overview'));
const Sales = lazy(() => import('./pages/Sales'));
const Stock = lazy(() => import('./pages/Stock'));
const Opex = lazy(() => import('./pages/Opex'));
const Stats = lazy(() => import('./pages/Stats'));
const Settings = lazy(() => import('./pages/Settings'));

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<div className="app-loading">กำลังโหลด...</div>}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<Overview />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/stock" element={<Stock />} />
                <Route path="/opex" element={<Opex />} />
                <Route path="/stats" element={<Stats />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
