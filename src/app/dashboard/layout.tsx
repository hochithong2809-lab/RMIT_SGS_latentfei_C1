"use client";

import { useTeamAuth } from '@/components/auth-context';
import { useEffect } from "react";

// Playbook: protect-routes-nextjs
// This is UI gating only — NOT real authorization.
// Real authorization happens in API routes via JWT verification.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authenticated, isInitializing, login, mode, initError } = useTeamAuth();

  useEffect(() => {
    if (!isInitializing && !authenticated) {
      if (mode === 'demo') window.location.replace('/');
      else void login();
    }
  }, [isInitializing, authenticated, login, mode]);

  if (initError) return <main className="setup-card"><h1>Unable to open your session.</h1><p>{initError.message}</p><a href="/">Return to sign in</a></main>;

  if (isInitializing || !authenticated) {
    return <p>Checking authentication...</p>;
  }

  return <>{children}</>;
}
