# OIDC Authorization Code + PKCE — integration contract
Status: design approved for implementation; no identity provider configured.

## Mobile
- Use system browser for authorization with Authorization Code + PKCE (S256).
- Register exact redirect URIs for iOS and Android and verify issuer, state and nonce.
- Do not embed client secrets in the app.
- Store refresh credentials only in platform secure storage; avoid logging tokens.
- Use access tokens with audience `ape-italia-api` and short lifetimes.
- Support logout, revocation and expiry; never fabricate a session.

## Backend
- Verify JWT signature with pinned issuer, audience, algorithms and remote JWKS.
- Derive subject from verified token, and organization membership from PostgreSQL.
- Never trust organization ID alone as proof of authorization.
- Enforce least privilege and membership revocation on every request.
- Rate limit, CORS allowlist, structured audit without credentials, and secure admin provisioning.

## Before activation
1. Select identity provider and configure development tenant.
2. Register application identifiers and redirect URI schemes.
3. Define provisioning of organizations and membership.
4. Add authenticated integration tests with signed synthetic JWTs and JWKS fixture.
5. Verify expiry, invalid audience/issuer, revoked membership, cross-tenant access.
6. Review GDPR, session retention and incident response.

No real user onboarding or production access until these gates pass.

## Stato (23/11/2026)
Flusso implementato su app, portale e API; verificato end-to-end con un provider reale (Keycloak) in CI: vedi `docs/OIDC_KEYCLOAK.md`. Restano: scelta del provider di produzione, MFA, test su dispositivi.
