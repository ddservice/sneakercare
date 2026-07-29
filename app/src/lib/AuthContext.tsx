import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';
import type { AuthUser, Role } from './types';

export const EMAIL_DOMAIN = '@ddserviceth.com';

interface AuthContextValue {
  auth: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function loadProfile(userId: string, fallbackUsername: string): Promise<AuthUser> {
  const { data: profile } = await supabase
    .from('sc_users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  return {
    userId,
    username: fallbackUsername,
    role: (profile?.role as Role) || 'manager',
    displayName: profile?.nickname || fallbackUsername,
    fullName: profile?.fullname || '',
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        const username = session.user.email.replace(EMAIL_DOMAIN, '');
        setAuth(await loadProfile(session.user.id, username));
      }
      setLoading(false);
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: username + EMAIL_DOMAIN,
      password,
    });
    if (error) throw error;
    setAuth(await loadProfile(data.user.id, username));
  };

  const logout = async () => {
    await supabase.auth.signOut().catch(() => {});
    setAuth(null);
  };

  return (
    <AuthContext.Provider value={{ auth, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
