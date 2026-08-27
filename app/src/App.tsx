import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider, MutationCache } from '@tanstack/react-query';
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

// พบว่า mutation ส่วนใหญ่ในแอปนี้ (toggle ปุ่มเล็กๆ อย่างเปิด/ปิดแจ้งเตือน, แก้จุดสั่งซื้อขั้นต่ำ,
// ยกเว้นประกันสังคม ฯลฯ) เรียก .mutate() เปล่าๆ ไม่มี onError/try-catch เลย — ถ้า request ล้มเหลว (เช่น
// เน็ตหลุด, RLS บล็อก) ผู้ใช้จะไม่เห็นอะไรเลย ปุ่มแค่ไม่เปลี่ยนสถานะเงียบๆ ทั้งที่ไม่มี toast library ในแอปนี้
// ใช้ MutationCache แบบ global แทน ครอบคลุมทุก mutation ในแอปโดยไม่ต้องแก้ทีละไฟล์ — mutation ไหนมี error
// handling ของตัวเองอยู่แล้ว (เช่น การบันทึกเงินเดือนใน PayrollSection.tsx) จะเห็น alert นี้เพิ่มมาด้วย
// เป็น safety net ซ้อน ไม่ใช่ปัญหา เพราะ error ที่มี handling อยู่แล้วเกิดไม่บ่อยอยู่แล้ว
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
      window.alert(`บันทึกไม่สำเร็จ: ${message}`);
    },
  }),
});

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
