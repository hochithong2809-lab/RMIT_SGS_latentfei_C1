'use client';
import { TideCloakProvider } from '@tidecloak/nextjs';
import { useEffect, useState } from 'react';
import { DemoAuthProvider, TideAuthBridge } from '@/components/auth-context';

// Runtime configuration avoids shipping a fabricated adapter before enrollment.
export function Providers({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/config', { cache: 'no-store' }).then(async r => {
    if (!r.ok) throw new Error('TideCloak setup is not complete.');
    setConfig(await r.json());
  }).catch(e => setError(e.message)); }, []);
  if (!config) return <main className="setup-page"><a className="brand" href="/"><span className="brand-mark">T</span> TeamVault</a>
    <div className="setup-card"><div className="eyebrow">YOUR WORK. THE RIGHT PEOPLE.</div><h1>A trusted space<br/>for your next big idea.</h1>
    <p>Project submissions, thoughtful reviews, and clear ownership. Powered by real TideCloak identities.</p>
    <div className="setup-status"><span className="status-dot"/>{error || 'Connecting to your workspace…'}</div>
    {error && <><h2>Finish local setup</h2><ol><li>Start Docker Desktop.</li><li>Set your licence email and personally accept Tide’s terms in <code>.env</code>.</li><li>Run <code>npm run init</code> and complete Tide enrollment.</li><li>Reload after <code>data/tidecloak.json</code> is exported.</li></ol><button onClick={() => location.reload()}>Check connection ↗</button></>}
    <small>No demo identity or simulated authorization is enabled.</small></div>
    <div className="setup-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="vault-shape">T<span>CONTROLLED ACCESS</span></div><span className="art-label">Good ideas deserve<br/>a better handoff.</span></div></main>;
  if (config.authMode === 'demo') return <DemoAuthProvider><div className="demo-banner" role="status"><strong>DEMO MODE</strong><span>TideCloak sign-in and roles are simulated. Access rules run on the server.</span><a href="/">Choose demo account ↗</a></div>{children}</DemoAuthProvider>;
  const { authMode: _mode, ...adapter } = config;
  const providerConfig = {
    ...adapter,
    useDPoP: { mode: 'strict', alg: 'ES256' },
  };
  return <TideCloakProvider config={providerConfig}><TideAuthBridge>{children}</TideAuthBridge></TideCloakProvider>;
}
