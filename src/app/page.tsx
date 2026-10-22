'use client';
import { useTideCloak } from '@tidecloak/nextjs';
import { useState } from 'react';
export default function HomePage() {
  const { authenticated, login, isInitializing, initError } = useTideCloak();
  const [error, setError] = useState('');
  return <main className="landing"><header><a className="brand" href="/"><span className="brand-mark">T</span> TeamVault</a><span className="protected-label">Protected by TideCloak ↗</span></header>
    <section className="landing-hero"><div><div className="eyebrow">LESS FRICTION. MORE FORWARD.</div><h1>Your next big idea.<br/><em>In the right hands.</em></h1><p>One place to submit your project, get thoughtful feedback, and keep every handoff accountable.</p>
    {authenticated ? <a className="button" href="/dashboard">Open your workspace ↗</a> : <button disabled={isInitializing} onClick={() => { setError(''); Promise.resolve(login()).catch(e => setError(e.message)); }}>{isInitializing ? 'Connecting…' : 'Enter with TideCloak ↗'}</button>}
    {(error || initError) && <p role="alert" className="notice error">{error || initError?.message}</p>}<small>Real identities. Clear permissions. Your team’s work stays with your team.</small></div>
    <div className="hero-visual" aria-hidden="true"><div className="visual-caption">A BETTER WAY TO HAND OFF</div><div className="visual-card"><span className="status approved">READY FOR WHAT’S NEXT</span><h2>From first draft<br/>to shared progress.</h2><div className="progress-line"><i/><i/><i/></div><div className="visual-step">01 Draft <span>02 Review</span> 03 Approved</div><div className="visual-bottom"><span className="mini-shield">✓</span> The right access, at every step.</div></div><span className="visual-note">Built for teams.<br/>Designed around trust.</span></div></section>
    <section className="landing-features">{[['01','Make it yours','Give every project a clear home, with a description and links to the work.'],['02','Share with intention','Your team and assigned reviewers get access. Everyone else stays outside.'],['03','Move forward together','Submit, receive feedback, and track decisions in one clear timeline.']].map(([n,t,d]) => <article key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></article>)}</section><footer>TEAMVAULT <span>Project handoffs, with trust built in.</span></footer></main>;
}
