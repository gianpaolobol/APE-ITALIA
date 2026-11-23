import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { priceFor } from './pricing';
import { createCheckoutSession, stripeFromEnv, verifyWebhook } from './stripe';

describe('payments', () => {
 it('price is recomputed from the survey', () => {
  expect(priceFor({ propertyType: 'appartamento', floorArea: 90 })!.totalCents).toBe(21900);
  expect(priceFor({ propertyType: 'casa', floorArea: 380, urgency: 'urgente', hasPlan: 'no' })!.totalCents).toBe((349 + 100 + 49 + 29) * 100);
  expect(priceFor({})).toBeNull();
 });
 it('is disabled without keys', () => { expect(stripeFromEnv({})).toBeNull(); });
 it('verifies Stripe signatures with tolerance', () => {
  const raw = Buffer.from('{"type":"checkout.session.completed"}');
  const t = Math.floor(Date.now() / 1000);
  const sig = createHmac('sha256', 'whsec_x').update(`${t}.${raw.toString()}`).digest('hex');
  expect(verifyWebhook('whsec_x', `t=${t},v1=${sig}`, raw)).toBe(true);
  expect(verifyWebhook('whsec_y', `t=${t},v1=${sig}`, raw)).toBe(false);
  expect(verifyWebhook('whsec_x', `t=${t - 1000},v1=${sig}`, raw)).toBe(false);
  expect(verifyWebhook('whsec_x', undefined, raw)).toBe(false);
 });
 it('sends line items, idempotency key and reference to Stripe', async () => {
  let req: { body: string; headers: Record<string, string> } | undefined;
  const fake = (async (_u: string, init: { body: string; headers: Record<string, string> }) => { req = init; return new Response(JSON.stringify({ id: 'cs_1', url: 'https://checkout.stripe.com/c/1' })); }) as unknown as typeof fetch;
  const r = await createCheckoutSession({ secretKey: 'sk', webhookSecret: 'w', returnBaseUrl: 'https://api.example' }, { caseId: 'c1', paymentId: 'p1', lines: [{ label: 'APE', cents: 21900 }] }, fake);
  expect(r.url).toContain('checkout.stripe.com');
  const f = new URLSearchParams(req!.body);
  expect(f.get('line_items[0][price_data][unit_amount]')).toBe('21900');
  expect(f.get('client_reference_id')).toBe('p1');
  expect(req!.headers['Idempotency-Key']).toBe('checkout-p1');
 });
});
