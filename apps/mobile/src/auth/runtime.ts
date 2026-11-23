/** Wires the OIDC client to device adapters. Only public build-time configuration is read. */
import { OidcClient } from './client';
import { expoAuthDeps } from './expo-adapters';
import { loadAppAuthConfig, type AppAuthConfig } from '../session';

declare const process: { env: Record<string, string | undefined> };

// Expo inlines EXPO_PUBLIC_* only for literal `process.env.NAME` accesses.
export const appAuthConfig: AppAuthConfig | null = loadAppAuthConfig({
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
  EXPO_PUBLIC_OIDC_ISSUER: process.env.EXPO_PUBLIC_OIDC_ISSUER,
  EXPO_PUBLIC_OIDC_CLIENT_ID: process.env.EXPO_PUBLIC_OIDC_CLIENT_ID,
  EXPO_PUBLIC_OIDC_REDIRECT_URI: process.env.EXPO_PUBLIC_OIDC_REDIRECT_URI,
  EXPO_PUBLIC_OIDC_AUDIENCE: process.env.EXPO_PUBLIC_OIDC_AUDIENCE,
});

export const oidcClient: OidcClient | null = appAuthConfig ? new OidcClient(appAuthConfig.oidc, expoAuthDeps) : null;
