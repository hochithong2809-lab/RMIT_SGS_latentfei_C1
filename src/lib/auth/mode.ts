export type AuthMode = 'demo' | 'tide';

// No automatic downgrade when Tide is unavailable. Demo is an explicit operator choice.
export function authMode(): AuthMode {
  const mode = process.env.TEAMVAULT_AUTH_MODE || 'tide';
  if (mode !== 'demo' && mode !== 'tide') throw new Error('TEAMVAULT_AUTH_MODE must be demo or tide.');
  return mode;
}
