# TeamVault

**A project workspace for student teams, reviewers and administrators.**

Session 2 prototype. **TideCloak sign-in and roles are simulated for now, as explicitly requested.** Team membership, reviewer assignments and workflow permissions are enforced by the application server. This is not a live Tide login or a demonstration of Tide cryptographic guarantees. No video is included.

## Run locally — no Docker or realm needed

Use Node.js **22.13+** (Node 22 LTS recommended) and npm. From this directory:

```powershell
npm ci
npm run dev:demo
```

Open **http://localhost:3000** and choose one of the four sample accounts. An existing `.env` can remain in place; the demo command explicitly selects demo mode. You do not need a licence email, terms acceptance, `npm run init`, or `data/tidecloak.json` for this simulator.

If dependencies are already installed, run only `npm run dev:demo`. If Windows reports `EPERM ... next-swc...node` during `npm ci`, stop the running TeamVault server with Ctrl+C in its terminal and retry; the native compiler file is usually locked by that Node process.

For a production build of the **same simulator**:

```powershell
npm run build
npm run start:demo
```

Stop the dev server before starting the built version on the same port. Demo commands bind to `127.0.0.1`. To use another port: `npm run dev:demo -- --port 3002`.

## 1. Vision & originality

TeamVault gives project teams a clear path from first draft to reviewed submission. Members write a description and attach GitHub/demo links; administrators assign a reviewer; reviewers approve or ask for changes. A shared timeline makes the next step visible. This is a new workflow implementation, not a role selector placed on top of the FairEnrol example.

## 2. Trust constraint insight

Knowing a project URL should not grant access. A member of Team Alpha cannot read Team Beta's projects. A reviewer sees only assigned, non-draft projects. Administrators coordinate teams and assignments, but being an admin alone does not grant review permission. A reviewer cannot review their own team, including when they hold multiple roles.

These rules execute on the server for every API request, including direct requests that bypass the UI. The demo replaces identity establishment only; it does not replace the business permission checks.

## 3. Value & impact

Members keep drafts with their own team, reviewers have a focused queue, and administrators can manage handoffs without sharing credentials. A request for changes preserves the history and returns editing to the team. SQLite keeps submissions, assignments, sessions and activity across application restarts.

## 4. Where TideCloak fits

Planning used the official **Tide / Raziel MCP** at `https://mcp.tide.org/mcp`, server `@tideorg/mcp` **1.9.33**: `tide_choose_playbook`, `tide_playbook(add-rbac-nextjs)` and `tide_playbook(protect-api-nextjs)`. See [the integration plan](docs/SESSION2-PLAN.md) and [MCP provenance](docs/MCP-INTEGRATION.md).

| Boundary | Demo now | Live Tide path, preserved for later |
|---|---|---|
| Sign-in | Choose a predefined sample account | Official Tide SDK provider and callback |
| Identity | Opaque HttpOnly cookie; server-side SQLite session | `@tidecloak/verify`, embedded adapter keys and claim validation |
| Roles | Fixed server-side sample account catalogue | Verified realm roles / this application's client roles |
| Team/project authorization | SQLite membership, assignment and state checks | Same application rules after verified Tide identity |
| Logout | Revoke server session and clear cookie | SDK logout/session lifecycle |

`withIdentity` selects exactly one adapter. Demo mode is explicit (`TEAMVAULT_AUTH_MODE=demo`, set by the demo commands). Standard `npm run dev` / `npm start` use `tide` unless the operator explicitly sets the variable. Tide errors do **not** trigger fallback to a demo account. Demo endpoints return 404 in Tide mode, and Tide mode does not accept demo cookies.

The existing real SDK, callback, JWT and DPoP code has been retained. Live enrollment/login has **not** been verified because the earlier realm licence setup failed. This update does not provision a realm, register another licence or claim to resolve that external issue. Before enabling live mode, follow [live setup](docs/TIDE-SETUP.md), consult the current MCP verification playbook, and test the complete token/proof flow against the actual realm.

## 5. Prototype walkthrough

| Sample account | Role / team | What to try |
|---|---|---|
| Alex Morgan | Member / Alpha | Edit Campus Compass, submit it; see only Alpha projects |
| Sam Rivera | Member / Beta | See Second Bloom and Green Loop, with Alpha projects absent |
| Jordan Lee | Reviewer | Review Open Study; approve or request changes |
| Taylor Chen | Admin | Open People & access; assign Green Loop or a submitted draft to Jordan |

1. Enter as Alex, open Campus Compass, edit and submit.
2. Sign out or use **Choose demo account**, then enter as Taylor. Open the submitted project and assign Jordan.
3. Enter as Jordan, open the assigned project and request changes with feedback.
4. Enter as Alex, edit and resubmit; return as Jordan and approve.
5. Enter as Sam to verify Alpha projects are absent. Call the same Alpha project endpoint using Sam's session to confirm 404.

Sample GitHub links point to `https://github.com/` and should be replaced with actual project repositories before presenting. The initial `DEMO_SEEDED` timeline entry is labelled illustrative; it is not an action by a real Tide user. Seed data is created once in the demo database, so switching identities does not reset changes or memberships.

## Access and workflow

- Missing/invalid/expired session → **401**; insufficient role → **403**; project outside the actor's scope → **404**.
- `DRAFT → SUBMITTED → APPROVED` or `CHANGES_REQUESTED → edit → SUBMITTED`.
- Submitted and approved projects cannot be edited. State checks and writes occur in one SQLite transaction; a second concurrent decision gets **409**.
- No browser-supplied `role`, `userId`, `team_id` or status can override server identity or project ownership. Demo sign-in accepts only a known `accountId`.
- Cookie-authenticated mutations require a matching Origin. Demo sessions expire after four hours and are revoked on logout or account switching.
- Only HTTP/HTTPS links without embedded credentials are accepted. User text is rendered as text.

APIs: `/api/me`, `/api/submissions`, `/api/submissions/:id`, `/:id/submit`, `/:id/review`, `/api/admin/teams`, `/api/admin/assignments`. Demo-only session API: `/api/auth/session`. `/api/config` exposes the active mode and, in Tide mode, the public adapter fields.

## Data and configuration

| Setting | Purpose |
|---|---|
| `TEAMVAULT_AUTH_MODE` | `demo` or `tide`; no automatic fallback |
| `TEAMVAULT_DEMO_DB` | Demo database, default `./data/teamvault-demo.sqlite` |
| `TEAMVAULT_DB` | Separate live-mode database, default `./data/teamvault.sqlite` |
| `CLIENT_ADAPTER` / `data/tidecloak.json` | Live Tide adapter only; not needed for demo |

Do not point both database settings at the same file. Demo identities and sessions must remain separate from real project data. `.env`, adapters and local SQLite files are gitignored. The simulator does not create real Tide users, roles, tokens, enrolments or DPoP proofs. Anyone with access to this local simulator can select any sample account; it is for demonstration, not protecting sensitive data. There is no E2EE, cryptographically governed review approval, file upload or Session 1 model integration. The application/database operator remains trusted; audit history is not immutable against that operator.

## Checks

```powershell
npm run typecheck
npm test
npm run build
npm run test:demo-http
```

`test:demo-http` requires the build and starts its own temporary local server/database, leaving your demo projects untouched. It checks the complete request-changes/resubmit/approve lifecycle, concurrent decisions, logout and persistence after a server restart.

Tests cover cross-team isolation, assigned reviews, self-review denial, input tampering, state transitions, concurrent decisions, persistence, demo session tampering/expiry/logout, CSRF checks, and live-mode rejection of demo cookies. Local cryptographic test tokens exercise the live verifier but do not prove successful Tide integration. See [verification](docs/VERIFICATION.md) for the precise scope and historical licence failure.
