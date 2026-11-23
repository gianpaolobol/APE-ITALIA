import { createHmac, timingSafeEqual } from 'node:crypto';

/** Minimal Stripe client (Checkout Sessions + webhook signature). Enabled by STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET. */
export type StripeConfig = { secretKey: string; webhookSecret: string; returnBaseUrl: string };
export const STRIPE_CONFIG = Symbol('STRIPE_CONFIG');

export function stripeFromEnv(env = process.env): StripeConfig | null {
 if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.PUBLIC_API_URL) return null;
 return { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, returnBaseUrl: env.PUBLIC_API_URL.replace(/\/$/, '') };
}

export async function createCheckoutSession(cfg: StripeConfig, p: { caseId: string; paymentId: string; email?: string | null; lines: Array<{ label: string; cents: number }> }, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
 const f = new URLSearchParams();
 f.set('mode', 'payment');
 f.set('success_url', `${cfg.returnBaseUrl}/v1/payments/return?status=ok`);
 f.set('cancel_url', `${cfg.returnBaseUrl}/v1/payments/return?status=cancel`);
 f.set('client_reference_id', p.paymentId);
 f.set('metadata[caseId]', p.caseId);
 f.set('metadata[paymentId]', p.paymentId);
 f.set('locale', 'it');
 if (p.email) f.set('customer_email', p.email);
 p.lines.forEach((l, i) => {
  f.set(`line_items[${i}][quantity]`, '1');
  f.set(`line_items[${i}][price_data][currency]`, 'eur');
  f.set(`line_items[${i}][price_data][unit_amount]`, String(l.cents));
  f.set(`line_items[${i}][price_data][product_data][name]`, l.label);
 });
 const res = await fetchImpl('https://api.stripe.com/v1/checkout/sessions', {
  method: 'POST', headers: { Authorization: `Bearer ${cfg.secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': `checkout-${p.paymentId}` },
  body: f.toString(), signal: AbortSignal.timeout(20_000),
 });
 const body = (await res.json()) as { id?: string; url?: string; error?: { message?: string } };
 if (!res.ok || !body.id || !body.url) throw new Error(`stripe ${res.status}: ${body.error?.message ?? 'error'}`);
 return { id: body.id, url: body.url };
}

/** Verifies the Stripe-Signature header (v1 scheme, 5-minute tolerance) over the raw body. */
export function verifyWebhook(secret: string, header: string | undefined, raw: Buffer, now = Date.now()): boolean {
 if (!header) return false;
 const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=') as [string, string]).filter(([k]) => k === 't')) as { t?: string };
 const sigs = header.split(',').filter(kv => kv.startsWith('v1=')).map(kv => kv.slice(3));
 const t = Number(parts.t);
 if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300 || !sigs.length) return false;
 const expected = createHmac('sha256', secret).update(`${t}.${raw.toString('utf8')}`).digest();
 return sigs.some(s => { const b = Buffer.from(s, 'hex'); return b.length === expected.length && timingSafeEqual(b, expected); });
}
