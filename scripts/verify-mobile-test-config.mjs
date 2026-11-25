import { pathToFileURL } from 'node:url';

function stagingHost(host) {
  return host.split('.').some(label => /(?:^|-)staging(?:-|$)/.test(label));
}

export function validateMobileTestConfig({ api, expectedApi, issuer, expectedIssuer, clientId, audience }) {
  // Distribution is for the connected staging environment only; build-only
  // remains available for demo builds without signing or external uploads.
  if (!/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(api ?? '') ||
      !stagingHost(new URL(api).hostname) || api !== expectedApi) {
    throw new Error('Mobile test distribution requires the configured staging HTTPS API origin');
  }
  if ([issuer, expectedIssuer, clientId, audience].some(Boolean)) {
    if (!issuer || issuer !== expectedIssuer || !clientId || !audience ||
        !/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/[A-Za-z0-9._~-]+)*$/.test(issuer) ||
        !stagingHost(new URL(issuer).hostname) || new URL(issuer).href !== issuer ||
        /\s/.test(clientId) || /\s/.test(audience)) {
      throw new Error('Mobile test distribution requires complete, matching staging OIDC configuration');
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { EXPO_PUBLIC_API_BASE_URL: api, EXPECTED_STAGING_API: expectedApi,
    EXPO_PUBLIC_OIDC_ISSUER: issuer, EXPECTED_STAGING_OIDC: expectedIssuer,
    EXPO_PUBLIC_OIDC_CLIENT_ID: clientId, EXPO_PUBLIC_OIDC_AUDIENCE: audience } = process.env;
  try { validateMobileTestConfig({ api, expectedApi, issuer, expectedIssuer, clientId, audience }); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
