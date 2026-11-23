import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApeApi } from './api';
import { loadCaseSummaries, progressStep } from './cases';

afterEach(() => vi.unstubAllGlobals());
const session = { apiBaseUrl: 'https://api.example.test', accessToken: 'synthetic', organizationId: 'org-1' };

describe('case summaries', () => {
 it('maps statuses to progress steps', () => {
  expect(progressStep('DRAFT')).toBe(0);
  expect(progressStep('INSPECTION_SCHEDULED')).toBe(3);
  expect(progressStep('DELIVERED')).toBe(6);
  expect(progressStep('UNKNOWN')).toBe(0);
 });
 it('uses a single API call and adds labels', async () => {
  const f = vi.fn(async () => ({ ok: true, json: async () => [{ id: 'c1', status: 'INSPECTION_SCHEDULED', createdAt: 'x', property: { address: 'Via Uno 1', city: 'Bologna', region: 'Emilia-Romagna' }, inspection: { status: 'SCHEDULED', scheduledAt: 'y', performedAt: null, certifierName: 'Cert' }, certificate: null }] }));
  vi.stubGlobal('fetch', f);
  const s = await loadCaseSummaries(new ApeApi(session));
  expect(f).toHaveBeenCalledTimes(1);
  expect(f.mock.calls[0]).toEqual(['https://api.example.test/v1/case-summaries', expect.anything()]);
  expect(s[0]).toMatchObject({ label: 'Sopralluogo programmato', step: 3 });
 });
});
