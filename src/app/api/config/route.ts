import { loadTideConfig } from "@/lib/auth/tidecloakConfig";

// Serve adapter JSON for server-side use (e.g. JWT verification).
// The client-side SDK now imports the adapter JSON directly via TideCloakProvider's config prop.
// This route remains available for any server-side consumers that need the config.
export async function GET() {
  try {
    const config = loadTideConfig();
    const allowed = ['realm','auth-server-url','resource','ssl-required','public-client','confidential-port',
      'jwk','vendorId','homeOrkUrl','tide-vendor-id','tide-home-ork-url'];
    return Response.json(Object.fromEntries(Object.entries(config).filter(([k]) => allowed.includes(k) || k.startsWith('client-origin-auth-'))),
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json(
      { error: 'TideCloak is not configured. Follow README setup instructions.' },
      { status: 503 }
    );
  }
}
