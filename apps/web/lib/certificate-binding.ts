import { createHmac, timingSafeEqual } from 'node:crypto';
import type { WebSession } from './oidc';

/** Opaque, case-specific page binding. Never expose the session token or subject to the browser. */
export function certificateBinding(key: Buffer, session: WebSession, org: string, id: string): string {
 return createHmac('sha256', key).update(JSON.stringify(['ape-web:certificate:v1', session.sub, session.accessToken, session.expiresAt, org, id])).digest('hex');
}

export function matchesCertificateBinding(key: Buffer, session: WebSession, org: string, id: string, supplied: unknown): boolean {
 if (typeof supplied !== 'string' || !/^[a-f0-9]{64}$/.test(supplied)) return false;
 return timingSafeEqual(Buffer.from(certificateBinding(key, session, org, id), 'hex'), Buffer.from(supplied, 'hex'));
}
