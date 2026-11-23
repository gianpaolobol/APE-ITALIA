import type { ApiSession } from './api';

/** Must be replaced with an OIDC Authorization Code + PKCE session provider.
 * Fail closed: no credentials or tenant identity are fabricated in demo mode.
 */
export async function getVerifiedSession(): Promise<ApiSession | null> {
 return null;
}
