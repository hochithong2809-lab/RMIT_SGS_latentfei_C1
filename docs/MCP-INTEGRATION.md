# Tide integration provenance

The build connected directly to the official Streamable HTTP MCP endpoint `https://mcp.tide.org/mcp` via JSON-RPC, not an unofficial package. `initialize` reported `@tideorg/mcp` **1.9.33**. The following read-only tools were called:

- `tools/list`
- `tide_scaffold`: `nextjs-customer-portal`
- `tide_playbook`: `protect-api-nextjs`
- `tide_dpop_asset`
- `tide_hosting` (local Docker had already been selected by the user)
- `tide_canon`: troubleshooting / realm setup
- `tide_doctor`

Official templates were downloaded from `https://mcp.tide.org/pack/templates.tgz`. The callback page, provider configuration pattern, auth helpers, DPoP verifier, realm baseline, bootstrap and doctor originate from that pack. The auth wrapper was extended to use the official `@tidecloak/verify` helper, require expiry/subject/issued-at claims, restrict client roles to this application, use a persistent SQLite replay store, and ignore untrusted forwarded headers in this local deployment. The provider receives the public adapter at runtime so a checkout builds without a fake adapter.

The bootstrap was adapted to Compose/Windows: no destructive cleanup, no global container deletion, no host sudo requirement, and a separate helper container for Bash/curl/jq. App roles are defined before IGA initialization; the linked first operator receives the application admin role before the multi-admin transition. The original script's optional cosmetic branding is not enabled.

`public/tide_dpop_auth.html` was copied byte-for-byte from the pack. Its expected SHA-256 is:

```text
9d7844b938f0a2565fa910d3d30e9b8797cbfd6e0b73d59d804169a089aea757
```

The wildcard relay route, response body hash and response headers were also checked against the running app. Do not reformat this file.

Next.js and Tide SDK dependencies retain their respective upstream licences. The template source is provided by Tide; no ownership or blanket relicensing of upstream code is claimed here. Changes specific to TeamVault are the workflow, access rules, SQLite persistence, interface, tests and documentation.

References: [Raziel](https://docs.tide.org/ai-agent-pack), [Next.js SDK](https://docs.tide.org/Languages/NextJS/tidecloak-nextjs-intro), [verifier](https://docs.tide.org/Languages/NextJS/VerifyJWT), [submission example](https://github.com/truongnguyenxuanvinh/hackathon).
