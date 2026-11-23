import { ApiError, fetchMe, type ApiSession, type MembershipInfo } from './api';
import { validateOidcConfig, type OidcPublicConfig } from './auth-config';
import type { AuthSession } from './auth/client';

export type AppAuthConfig = { oidc: OidcPublicConfig; apiBaseUrl: string };

/**
 * Reads public (non-secret) configuration from EXPO_PUBLIC_* build variables.
 * Returns null when not configured: the app then stays in fail-closed demo mode.
 */
export function loadAppAuthConfig(env: Record<string, string | undefined>): AppAuthConfig | null {
 const apiBaseUrl = env.EXPO_PUBLIC_API_BASE_URL;
 if (!apiBaseUrl || !/^https:\/\//.test(apiBaseUrl)) return null;
 try {
  const oidc = validateOidcConfig({
   issuer: env.EXPO_PUBLIC_OIDC_ISSUER,
   clientId: env.EXPO_PUBLIC_OIDC_CLIENT_ID,
   redirectUri: env.EXPO_PUBLIC_OIDC_REDIRECT_URI ?? 'apeitalia://auth/callback',
   audience: env.EXPO_PUBLIC_OIDC_AUDIENCE ?? 'ape-italia-api',
  });
  return { oidc, apiBaseUrl };
 } catch {
  return null;
 }
}

export interface SessionSource { getSession(): Promise<AuthSession | null> }

/**
 * Builds an API session only from a verified OIDC session and a membership confirmed by the API.
 * The organization is never chosen from local constants; with several memberships the caller must pick one.
 */
export async function resolveApiSession(
 auth: SessionSource,
 apiBaseUrl: string,
 preferredOrganizationId?: string,
): Promise<{ session: ApiSession | null; memberships: MembershipInfo[] }> {
 const authSession = await auth.getSession();
 if (!authSession) return { session: null, memberships: [] };
 let me;
 try {
  me = await fetchMe(apiBaseUrl, authSession.accessToken);
 } catch (e) {
  if (e instanceof ApiError && e.status === 401) return { session: null, memberships: [] };
  throw e;
 }
 if (me.subject !== authSession.subject) return { session: null, memberships: [] };
 const memberships = me.memberships;
 const chosen = preferredOrganizationId
  ? memberships.find(m => m.organizationId === preferredOrganizationId)
  : memberships.length === 1 ? memberships[0] : undefined;
 if (!chosen) return { session: null, memberships };
 return { session: { apiBaseUrl, accessToken: authSession.accessToken, organizationId: chosen.organizationId }, memberships };
}
