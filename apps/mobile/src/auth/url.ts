/**
 * Minimal URL helpers. React Native's URL/URLSearchParams polyfill differs from WHATWG
 * (e.g. toString() re-appends an existing query), so auth code avoids it entirely.
 */
const HTTPS_URL = /^https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?(?:[/?#][^\s]*)?$/;

export function isHttpsUrl(value: unknown): value is string {
  return typeof value === 'string' && HTTPS_URL.test(value);
}

export function appendQuery(base: string, params: Record<string, string>): string {
  const hash = base.indexOf('#');
  if (hash !== -1) base = base.slice(0, hash);
  const qs = Object.entries(params).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
  if (!qs) return base;
  return base + (base.includes('?') ? (base.endsWith('?') || base.endsWith('&') ? '' : '&') : '?') + qs;
}

export function parseQuery(query: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of query.replace(/^\?/, '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const rawKey = eq === -1 ? pair : pair.slice(0, eq);
    const rawValue = eq === -1 ? '' : pair.slice(eq + 1);
    const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    // Duplicate parameters are a protocol violation (RFC 6749 §3.1): reject.
    if (out.has(key)) throw new Error('Duplicate query parameter: ' + key);
    out.set(key, decodeURIComponent(rawValue.replace(/\+/g, ' ')));
  }
  return out;
}
