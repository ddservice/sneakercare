import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { auth, loading } = useAuth();
  if (loading) return <div className="app-loading">กำลังโหลด...</div>;
  if (!auth) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
