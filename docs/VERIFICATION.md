# Verification record — 22 October 2026

## Current simulation update

The user explicitly authorized simulated TideCloak sign-in and roles. `npm run dev:demo` / `npm run start:demo` run the actual Next.js app with a separate persistent demo SQLite database. It is a workflow simulator, not live Tide authentication.

- TypeScript: passed.
- Application tests: **25 passed**, including eight demo/session tests in addition to the original 17 access/crypto/persistence tests.
- Production build: passed on Windows. One sandboxed build encountered Windows EPERM creating a generated directory; the same build completed outside that sandbox.
- Demo tests cover missing/tampered/expired/revoked sessions, predefined identities, account-switch revocation, cross-origin mutations, member/admin separation, project scope and rejection of demo cookies in Tide mode.
- Production HTTP integration passed against a dedicated temporary server/database: all four sign-ins, anonymous 401, member/admin 403, cross-team 404, draft privacy, payload tampering, submit/assignment/changes/edit/resubmit, concurrent approval (one 200, one 409), logout revocation, and project/session/audit persistence after restart. Run with `npm run test:demo-http` after building.
- Browser verified actual demo sign-in as Team Alpha and its two-project dashboard with the simulation banner. This is the running app, not the historical read-only UI fixture.
- The original real realm licence issue remains unresolved; no real login is claimed by the simulator.

The historical record below describes the original live-mode implementation and its isolated UI fixture, before the simulator was requested.

## Result

**Implementation is built and tested; real Tide authentication remains externally blocked.** No successful production Tide login or end-to-end four-account workflow is claimed.

| Check | Result |
|---|---|
| Windows production build / TypeScript | Passed |
| Linux Node 22 production build in Docker | Passed |
| Domain/API/cryptographic tests | 17 passed on Windows and Linux Node 22 |
| Direct unauthenticated `/api/me`, `/api/submissions`, `/api/admin/teams` | `401` from the running production app |
| Unconfigured public adapter endpoint | `503`; no fabricated configuration |
| DPoP relay wildcard route | `200`; byte-exact known-good asset |
| Relay headers | `default-src 'self'; script-src 'unsafe-inline'` and `Allow-CSP-From: *` |
| Dashboard UI | Isolated read-only fixture checked in browser; status filter and detail panel work |
| Tide realm licence initialization | Failed at external wallet/licence finalization |
| Real login and real-account review workflow | Not yet verifiable |

## External blocker observed

TideCloak development image starts and the realm/client template is created. Licence initialization at:

```text
POST /admin/realms/<realm>/vendorResources/setUpTideRealm
HTTP 500
TIDE-IDPEXT-VENDOR-KEYGEN_FAILED
The vendor key was created but the license could not be set up.
```

Underlying server log:

```text
[Midgard] GetSubscriptionInfo ... 404 (Not Found)
[Midgard] FinalizeWallet ... 500 (Internal Server Error)
Could not finalize wallet for realm ...
```

The operator supplied a real email and explicitly agreed to Tide terms. A second fresh realm was attempted only after explicit permission. Both `teamvault` and `teamvault-c2` returned the same licence error. Both were preserved; no realm/database was deleted and no paid checkout was accepted. No working `data/tidecloak.json` was exported.

This needs a healthy Tide licence/wallet service or guidance from the Tide organizers/support. No support message has been sent automatically. Do not keep creating realms or change the realm state to bypass this error. The private local `.env` currently points to the second attempted realm; a clean checkout’s `.env.example` defaults to `teamvault`.

## Official diagnostic

Raziel `tide_doctor` was called, and its shipped diagnostic script was run against source and the live relay route. The relay asset, rewrite, server verification, ignored operator secrets and response headers passed. The required real adapter remains absent because licence setup failed. One initial run used BusyBox grep, which does not support the full scanner flags; the helper image was corrected to include GNU grep before rerunning. A provider-option detection warning was cross-checked directly against the actual `useDPoP` configuration; DPoP has not been disabled.

## Complete these real-account checks after licence recovery

1. Finish initialization, link the first Tide account, verify IGA is enabled, and export the real adapter with embedded `jwk` and signed origin entries.
2. Restart/reload the app. Complete login, confirm `/api/me` succeeds through SDK `secureFetch`, and confirm plain-Bearer replay is rejected.
3. Create/link Member A, Member B, Reviewer and Admin; grant their intended Tide application roles and log each in once.
4. Admin assigns the two members to Alpha/Beta. Member A creates and submits a project. Member B cannot list/read/edit it, including direct API calls.
5. Admin assigns Reviewer. Reviewer requests changes. Member A edits and resubmits. Reviewer approves.
6. Confirm self-review is denied for an account with combined member/reviewer roles; admin alone cannot review.
7. Confirm workflow and history persist after restarting the application.

Unit tests use generated cryptographic test keys and synthetic actors in separate test processes. Those fixtures are never accepted as credentials by the running app. A fixture screenshot is a UI layout check, not evidence of real Tide authentication.

## UI fixture

```powershell
node scripts/ui-fixture.mjs
```

Open `http://localhost:3100`. The page is clearly labelled as a synthetic UI fixture. It is read-only and runs independently of the real Next.js app at port 3000. The test source is under `tests/`; generated files are ignored under `test-results/`. `docs/screenshots/dashboard-fixture.png` records the desktop layout check.
