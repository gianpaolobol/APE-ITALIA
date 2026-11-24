import { beforeEach, describe, expect, it, vi } from 'vitest';
import { certificateBinding } from './certificate-binding';
import { GET } from '../app/org/cases/[id]/certificate/route';
import { confirmCertificateReceipt } from '../app/org/actions';

const mocks = vi.hoisted(() => ({ orgContext: vi.fn(), orgFetch: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('./org', () => ({ orgContext: mocks.orgContext, isUuid: (v: string) => /^[0-9a-f-]{36}$/.test(v) }));
vi.mock('./api', () => ({ orgFetch: mocks.orgFetch, ApiFailure: class extends Error {} }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));

const key = Buffer.alloc(32, 7);
const s = { sub: 'synthetic-alice', accessToken: 'synthetic-token-a', expiresAt: 1234567890 };
const org = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const hash = 'a'.repeat(64);
const binding = certificateBinding(key, s, org, id);
const context = (session = s, organizationId = org) => ({ cfg: { sessionKey: key }, s: session, membership: { organizationId } });
const request = (value?: string) => new Request('https://localhost/org/cases/' + id + '/certificate', { headers: value ? { 'x-ape-certificate-binding': value } : {} });
const params = { params: Promise.resolve({ id }) };

describe('web certificate endpoints', () => {
 beforeEach(() => {
  vi.resetAllMocks();
  mocks.orgContext.mockResolvedValue(context());
  mocks.orgFetch.mockImplementation(async () => new Response('synthetic-pdf'));
 });
 it('rejects GET without the page binding and does not fetch PDF', async () => {
  expect((await GET(request(), params)).status).toBe(403);
  expect(mocks.orgFetch).not.toHaveBeenCalled();
 });
 it('rejects GET and receipt after same-org account change', async () => {
  mocks.orgContext.mockResolvedValue(context({ ...s, sub: 'synthetic-bob', accessToken: 'synthetic-token-b' }));
  expect((await GET(request(binding), params)).status).toBe(403);
  await expect(confirmCertificateReceipt(id, org, binding, hash, 13)).rejects.toThrow('Session or organization changed');
  expect(mocks.orgFetch).not.toHaveBeenCalled();
 });
 it('rejects receipt after session replacement or tenant switch', async () => {
  mocks.orgContext.mockResolvedValue(context({ ...s, accessToken: 'synthetic-token-b' }));
  await expect(confirmCertificateReceipt(id, org, binding, hash, 13)).rejects.toThrow();
  mocks.orgContext.mockResolvedValue(context(s, '33333333-3333-4333-8333-333333333333'));
  await expect(confirmCertificateReceipt(id, org, binding, hash, 13)).rejects.toThrow();
  expect(mocks.orgFetch).not.toHaveBeenCalled();
 });
 it('allows the authorized download and then the explicit receipt', async () => {
  const response = await GET(request(binding), params);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).toBe('synthetic-pdf');
  await confirmCertificateReceipt(id, org, binding, hash, 13);
  expect(mocks.orgFetch).toHaveBeenCalledTimes(2);
  expect(mocks.orgFetch.mock.calls[0][3]).toBe('/v1/cases/' + id + '/certificate/content');
  expect(mocks.orgFetch.mock.calls[1][3]).toBe('/v1/cases/' + id + '/certificate/receipt');
 });
});
