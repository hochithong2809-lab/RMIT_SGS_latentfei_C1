'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useTideCloak } from '@tidecloak/nextjs';
import type { Actor } from '@/lib/store';

type DemoAccount = { id: string; name: string; caption: string; description: string };
type AuthState = {
  mode: 'demo' | 'tide'; authenticated: boolean; isInitializing: boolean;
  initError: Error | null; sessionKey: string | null; accounts: DemoAccount[];
  login: (accountId?: string) => Promise<void>; logout: () => Promise<void>;
  secureFetch: (url: string, init?: RequestInit) => Promise<Response>;
};
const AuthContext = createContext<AuthState | null>(null);
export function useTeamAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('TeamVault auth provider is missing.');
  return context;
}

export function TideAuthBridge({ children }: { children: React.ReactNode }) {
  const tide = useTideCloak();
  return <AuthContext.Provider value={{ mode: 'tide', authenticated: tide.authenticated,
    isInitializing: tide.isInitializing, initError: tide.initError || null,
    sessionKey: tide.token || null, accounts: [],
    login: async () => { await tide.login(); }, logout: async () => { await tide.logout(); },
    secureFetch: (url, init) => tide.secureFetch(url, init),
  }}>{children}</AuthContext.Provider>;
}

export function DemoAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<Actor | null>(null);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/session', { cache: 'no-store', credentials: 'same-origin' }).then(async response => {
      if (!response.ok) throw new Error('Unable to load demo sign-in.');
      const state = await response.json();
      if (active) { setUser(state.user); setAccounts(state.accounts); }
    }).catch(e => { if (active) setError(e); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const secureFetch = useCallback(async (url: string, init?: RequestInit) => {
    const response = await fetch(url, { ...init, credentials: 'same-origin' });
    if (response.status === 401) setUser(null);
    return response;
  }, []);
  async function login(accountId?: string) {
    if (!accountId) { window.location.assign('/'); return; }
    const response = await fetch('/api/auth/session', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to sign in.');
    setUser(data.user);
    window.location.assign('/dashboard');
  }
  async function logout() {
    const response = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Unable to sign out. Please try again.');
    setUser(null); window.location.assign('/');
  }
  return <AuthContext.Provider value={{ mode: 'demo', authenticated: Boolean(user),
    isInitializing: loading, initError: error, sessionKey: user?.sub || null,
    accounts, login, logout, secureFetch }}>{children}</AuthContext.Provider>;
}
