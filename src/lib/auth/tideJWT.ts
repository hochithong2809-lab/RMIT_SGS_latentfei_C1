import type { JWTPayload } from "jose";
import { loadTideConfig } from "./tidecloakConfig";
import { verifyTideCloakToken } from '@tidecloak/verify';

// Lazy initialization — do NOT load config at module level.
// Next.js 16 evaluates module-level code during `next build` for static
// page generation. If tidecloak.json doesn't exist yet (placeholder or
// pre-bootstrap), eager loading throws at build time.
let _config: ReturnType<typeof loadTideConfig> | null = null;

function getConfig() {
  if (!_config) {
    _config = loadTideConfig();
    if (!_config.jwk) {
      throw new Error(
        "Adapter JSON missing jwk field. Re-export with IGA enabled."
      );
    }
  }
  return { config: _config };
}

export async function verifyTideJWT(token: string): Promise<JWTPayload> {
  const { config } = getConfig();
  const verified = await verifyTideCloakToken(config, token);
  if (!verified) throw new Error('Invalid Tide token');
  const payload = verified as JWTPayload;

  if (payload.azp !== config.resource) {
    throw new Error("Token azp does not match client");
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error("Token expired");
  }
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.iat !== 'number' || payload.iat > now + 60) {
    throw new Error("Token issued in future");
  }

  return payload;
}

export function hasRole(payload: JWTPayload, role: string): boolean {
  const realmRoles = (payload.realm_access as { roles?: unknown })?.roles;
  if (Array.isArray(realmRoles) && realmRoles.includes(role)) return true;

  const resourceAccess = payload.resource_access as Record<string, { roles?: string[] }> | undefined;
  const clientRoles = resourceAccess?.[getConfig().config.resource]?.roles;
  return Array.isArray(clientRoles) && clientRoles.includes(role);
}

export function extractToken(authHeader: string | null): string {
  if (!authHeader) throw new Error("Missing Authorization header");
  if (authHeader.startsWith("Bearer ")) return authHeader.substring(7);
  if (authHeader.startsWith("DPoP ")) return authHeader.substring(5);
  throw new Error("Invalid Authorization header format");
}
