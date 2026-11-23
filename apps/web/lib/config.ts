export type WebConfig = {
 issuer: string;
 clientId: string;
 clientSecret?: string;
 audience: string;
 baseUrl: string;
 apiBaseUrl: string;
 sessionKey: Buffer;
};

const https = (v: string | undefined) => !!v && /^https:\/\/[A-Za-z0-9.-]+(:\d+)?(\/.*)?$/.test(v);
const httpsOrLocal = (v: string | undefined) => https(v) || (!!v && /^http:\/\/localhost(:\d+)?$/.test(v));

/** Server-only configuration. Returns null (portal disabled, fail closed) unless complete and safe. */
export function loadWebConfig(env: Record<string, string | undefined> = process.env): WebConfig | null {
 const key = env.WEB_SESSION_KEY ? Buffer.from(env.WEB_SESSION_KEY, 'base64') : null;
 if (!https(env.OIDC_ISSUER) || !env.WEB_OIDC_CLIENT_ID || !httpsOrLocal(env.WEB_BASE_URL) || !https(env.API_BASE_URL) || !key || key.length !== 32) return null;
 return {
  issuer: env.OIDC_ISSUER!,
  clientId: env.WEB_OIDC_CLIENT_ID,
  ...(env.WEB_OIDC_CLIENT_SECRET ? { clientSecret: env.WEB_OIDC_CLIENT_SECRET } : {}),
  audience: env.OIDC_AUDIENCE ?? 'ape-italia-api',
  baseUrl: env.WEB_BASE_URL!.replace(/\/$/, ''),
  apiBaseUrl: env.API_BASE_URL!.replace(/\/$/, ''),
  sessionKey: key,
 };
}
