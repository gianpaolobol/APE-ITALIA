import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { raw } from 'express';

/**
 * HTTP hardening shared by main.ts and tests. The API serves only JSON and file downloads to
 * native apps and to the web BFF (server-to-server), so CORS stays disabled (no browser origins).
 */
export function configureHttp(app: INestApplication, env = process.env) {
 const http = app.getHttpAdapter().getInstance() as { set(k: string, v: unknown): void; disable(k: string): void };
 http.disable('x-powered-by');
 // Behind a reverse proxy set TRUST_PROXY to the number of hops so rate limits see the client IP.
 const hops = Number(env.TRUST_PROXY ?? 0);
 if (Number.isInteger(hops) && hops > 0) http.set('trust proxy', hops);
 // Resumable upload parts arrive as base64 text (4 MiB binary -> ~5.6 MB text); only this path accepts them.
 app.use(/^\/v1\/cases\/[^/]+\/uploads\/[^/]+\/parts\/\d+$/, raw({ type: 'text/plain', limit: '6mb' }));
 // Stripe signs the exact bytes: the webhook body must stay raw.
 app.use('/v1/payments/webhook', raw({ type: 'application/json', limit: '1mb' }));
 app.use(helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'no-referrer' },
 }));
}
