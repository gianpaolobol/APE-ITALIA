/** Public OIDC client metadata. Never place a client secret in a mobile app. */
export type OidcPublicConfig = { issuer: string; clientId: string; redirectUri: string; audience: string };
export function validateOidcConfig(input: Partial<OidcPublicConfig>): OidcPublicConfig {
 const {issuer,clientId,redirectUri,audience}=input;
 if(!issuer?.startsWith('https://') || !clientId || !audience || !redirectUri?.startsWith('apeitalia://')) {
  throw new Error('OIDC public configuration incomplete or invalid');
 }
 return {issuer,clientId,redirectUri,audience};
}
