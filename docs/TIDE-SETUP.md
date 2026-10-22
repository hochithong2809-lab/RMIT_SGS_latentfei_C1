# Original live Tide setup (not needed for demo)

Historical integration and setup guide. The current default demo commands do not perform these steps. Live login remains unverified until enrollment succeeds.

# TeamVault

**A protected workspace for project submissions and thoughtful reviews.**

Built with [TideCloak](https://docs.tide.org/) using the official [Raziel MCP](https://docs.tide.org/ai-agent-pack) Next.js template. Session 2 deliverable: source code, README, setup and tests. **No video is included, as requested.** The photographed competition submission instructions request a video; this package does not satisfy that particular item.

## 1. Vision & originality

TeamVault gives student teams a clear path from idea to reviewed submission. Members draft a project, attach repository/demo links and send it for review. An administrator assigns a reviewer, who either approves it or requests changes. The app is a new implementation rather than a reskin of the FairEnrol example.

## 2. Trust constraint insight

Project material should not become visible merely because somebody knows its URL or changes a role selector. TeamVault uses a real identity from TideCloak, then enforces team membership, reviewer assignment and workflow state in the server. A reviewer who also belongs to a project’s team cannot approve it. An application administrator does not implicitly receive review authority.

## 3. Value & impact

Members know where their submission stands and what needs to change. Reviewers receive only the work assigned to them. Administrators coordinate access without passing passwords around. For example, Team Alpha’s draft remains invisible to Team Beta; once submitted, only the assigned reviewer can make a review decision.

## 4. Why TideCloak matters

- Official Tide SDK provides login/logout, callback processing, session refresh and DPoP request generation.
- Every protected API verifies a token with `@tidecloak/verify`, using the adapter’s embedded public keys, the correct issuer/client and required time/subject claims.
- The official template’s DPoP verifier checks proof signature, token binding, method, URL, token hash and replay. TeamVault stores used proof IDs in SQLite, shared between application processes.
- Realm roles (`member`, `reviewer`, `admin`) come from verified Tide claims. Client roles count only for the configured TeamVault client.
- App-specific team membership and review assignments live in SQLite and are checked on every action.

This version **does not implement E2EE or cryptographically governed business approvals**. The application server and database operator remain trusted. Audit history is not immutable against database administrators. TideCloak security does not replace application-level authorization.

## 5. Prototype & storytelling

The important interaction is **draft → submit → assigned review → changes requested → edit/resubmit → approve**. Show the same project URL to a different team and confirm `404`. Try the admin API as a member and confirm `403`. Signing out and calling a protected API returns `401`. These checks operate on the API, not just the buttons.

## Prerequisites

- Docker Desktop running with Linux containers; Docker Compose v2.
- Node.js **22.13+** (Node 22 LTS recommended), npm. SQLite uses the built-in `node:sqlite` module, which may print an experimental-feature warning on Node 22.
- Internet access for downloading packages/images and communicating with Tide’s network. Local Docker does **not** make Tide authentication offline.
- A real licence email and personal agreement to [Tide’s terms](https://tide.org/legal).

## Local setup

```powershell
cd path/to/teamvault
npm ci
Copy-Item .env.example .env
# Edit .env: choose a strong KC_BOOTSTRAP_ADMIN_PASSWORD, supply your
# TIDE_LICENSE_EMAIL, and set TIDE_TERMS_ACCEPTED=yes only if you agree.
npm run init
```

`npm run init` starts the dedicated TideCloak container, runs the adapted official bootstrap in a helper container (no host Bash/jq required), then stops at an enrollment link. Open that link yourself and finish Tide account enrollment. Leave initialization running. On success it exports **`data/tidecloak.json`** containing the embedded public key and signed origin configuration.

The initial linked operator receives the TeamVault `admin` role. App administration and Tide realm administration are distinct. The realm template defines all three application roles but never grants member/reviewer/admin to every user by default.

Start the app:

```powershell
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000), choose **Enter with TideCloak**, and complete login. The app fetches the public adapter at runtime; it can build before enrollment and will show setup instructions rather than a simulated user when the adapter is absent.

Alternatively run the app in Docker after initialization:

```powershell
docker compose up -d --build app
```

Do not run both the host app and Docker app on port 3000 at the same time. The adapter must use the browser-facing `http://localhost:8080` issuer. Do not replace it with an internal Compose service hostname. The app verifies embedded keys locally and does not need a remote JWKS fallback.

### Configuration

| Setting | Purpose |
|---|---|
| `KC_BOOTSTRAP_ADMIN_USERNAME` / `KC_BOOTSTRAP_ADMIN_PASSWORD` | Private local Tide operator credentials; `.env` only |
| `TIDE_LICENSE_EMAIL` | Real address supplied by the operator |
| `TIDE_TERMS_ACCEPTED` | `yes` only after the operator agrees |
| `TIDE_REALM` | Initial realm name, default `teamvault`; set before first initialization |
| `TEAMVAULT_DB` | App SQLite location, default `./data/teamvault.sqlite` |
| `CLIENT_ADAPTER` | Optional server-side adapter JSON instead of the adapter file |

Never put passwords, access tokens or `.env` contents in a public repo. The adapter is a public-client export but is ignored in this package because it is deployment-specific. `.env.example` is blank by design. No credentials are embedded in the app image.

### Existing or failed realm

Initialization never deletes a container, realm or database. A duplicate realm returns an error rather than wiping existing work. Do not repeatedly run the bootstrap against a partially initialized realm. Preserve it and inspect logs / Tide Console first. In particular, **do not disable IGA, weaken signature algorithms, fabricate an adapter or bypass DPoP** to make login appear to work.

If licence creation fails with `TIDE-IDPEXT-VENDOR-KEYGEN_FAILED` / `Midgard.FinalizeWallet`, the app code cannot manufacture a valid licence. See `docs/VERIFICATION.md` for this implementation’s observed results. Creating another realm creates another external licence registration and should be an intentional operator decision. The bootstrap stops if it receives a paid-checkout response; it does not pay for anything.

## Set up real demo identities

Create/link accounts through the **Tide Console** for this realm. There are no hardcoded demo passwords or synthetic login tokens. Use the console’s governed approval flow to grant:

| Account | Tide application role | Team |
|---|---|---|
| Member A | `member` | Team Alpha |
| Member B | `member` | Team Beta |
| Reviewer | `reviewer` | No team |
| Operator | `admin` | No team |

Each account signs into TeamVault once. Admin → **People & access** then assigns the two members to their teams. Accounts without an application role can see their own identity but no submissions. The UI never changes a user’s Tide role.

Use separate browser profiles for concurrent identities, or log out between accounts. Create a project as a member and submit it. As admin, open the submitted project and assign the reviewer. As reviewer, open **Assigned reviews** and provide a decision and feedback.

### Optional synthetic project content

After creating the four **real** identities and granting their Tide roles, create ignored `data/demo-accounts.json`:

```json
{
  "memberA": "REPLACE_WITH_REAL_SUBJECT_ID",
  "memberB": "REPLACE_WITH_REAL_SUBJECT_ID",
  "reviewer": "REPLACE_WITH_REAL_SUBJECT_ID",
  "admin": "REPLACE_WITH_REAL_SUBJECT_ID"
}
```

```powershell
npm run seed -- data/demo-accounts.json
```

This links real subjects to two teams and seeds two synthetic project descriptions. It **does not** create Tide users, grant Tide roles or bypass token verification. Replace the seed’s generic repository links before presenting. Subject IDs can be read from the console or `/api/me`; do not paste access tokens into the mapping file.

## API contract

All endpoints below require a valid SDK-generated DPoP request. The browser calls `secureFetch`; a manually copied Bearer token is intentionally insufficient.

| Endpoint | Behavior |
|---|---|
| `GET /api/me` | Verified identity, app roles, own team ID |
| `GET /api/submissions` | Only submissions visible to this identity |
| `POST /api/submissions` | Member creates a draft in their server-resolved team |
| `GET /api/submissions/:id` | Visible submission and its audit history |
| `PATCH /api/submissions/:id` | Own team updates a draft or changes-requested project |
| `POST /api/submissions/:id/submit` | Own team sends an editable project for review |
| `POST /api/submissions/:id/review` | Assigned reviewer applies one decision with feedback |
| `GET /api/admin/teams` | Admin sees teams, registered accounts, memberships, recent audit |
| `POST /api/admin/teams` | Admin creates a team, assigns/removes membership |
| `POST /api/admin/assignments` | Admin assigns a non-conflicted reviewer to a submitted project |

Project payload: `{title, description, github_url, demo_url}`. Review payload: `{decision: "APPROVED" | "CHANGES_REQUESTED", feedback}`. Assignment payload: `{submission_id, reviewer_sub}`. Team actions: `{action:"create",name}`, `{action:"assign",subject,team_id}` or `{action:"remove",subject}`. Submit body is `{}`. Extra fields are rejected. URLs allow http/https only, without embedded credentials; the server never fetches those URLs.

`401`: invalid identity/token/proof. `403`: insufficient role or self-review. `404`: missing/out-of-scope submission. `409`: locked or invalid workflow state. `400`: bad input. Valid identity checks happen before application operations. Unknown fields cannot set an actor, role, team, status or reviewer implicitly.

Review transitions, team changes and audit writes are atomic SQLite transactions. `BEGIN IMMEDIATE` prevents two processes from applying two review decisions. Members can edit `DRAFT` and `CHANGES_REQUESTED`; `SUBMITTED` and `APPROVED` are locked. A reviewer’s access to a submitted draft comes from explicit assignment, not a global list-all permission.

## Tests and diagnosis

```powershell
npm test
npm run typecheck
npm run build
```

Automated tests cover cross-team access, role checks, payload tampering, self-review, state transitions, concurrent reviews from separate processes, database reopen in a new process, actual cryptographic verification with **test-only generated keys**, and DPoP failures/replay. Test identities never enter the running application. These tests do not prove enrollment or login against Tide’s real network.

For the official diagnostic script with Git Bash / Linux:

```bash
bash scripts/tide-doctor.sh --app . --url http://localhost:3000 --check
```

Or use the included Docker helper (PowerShell):

```powershell
docker compose --profile setup run --rm --no-deps --entrypoint bash -v "${PWD}/.:/app:ro" bootstrap scripts/tide-doctor.sh --app /app --url http://host.docker.internal:3000 --check
```

Never claim a real auth pass from unit tests alone. Complete real-account checks in `docs/VERIFICATION.md` after enrollment succeeds.

## Persistence and limits

App data is in `data/teamvault.sqlite` (+ SQLite WAL files); Tide state is in the Compose `tide-state` named volume. `docker compose down` preserves data. Do not use `down -v` unless you intend to permanently remove the local Tide state. Back up SQLite using its backup API or stop the app before copying all relevant files.

This is a local prototype: no file upload, public hosting, production rate limiting, E2EE, immutable audit, email notifications, model inference, or multi-party review. Existing access tokens remain valid until expiry after role revocation. Membership/assignment changes take effect on the next API call. The HTTP origins and relaxed iframe policy are for local Tide integration; production deployment needs a separate security review.

## GitHub handoff

Commit source, `package-lock.json`, `.env.example`, tests, docs and the DPoP relay asset. Do **not** commit `.env`, `data/tidecloak.json`, databases, subject mappings, `node_modules`, `.next` or test artifacts. Push to your own repository, set the required `<university>_<campus>_<team>_C2` submission name, and supply that repository URL through the organizer’s form yourself. No form has been submitted and no video has been produced.

Third-party template provenance and MCP usage: `docs/MCP-INTEGRATION.md`.
