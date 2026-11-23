import { describe, expect, it } from 'vitest';
import { retentionPolicyFromEnv } from './privacy';
describe('retention policy configuration', () => {
 it('uses conservative defaults and refuses values under 30 days', () => {
  expect(retentionPolicyFromEnv({})).toEqual({ cancelledCaseEvidenceDays: 90, closedCaseEvidenceDays: 730 });
  expect(retentionPolicyFromEnv({ RETENTION_CANCELLED_EVIDENCE_DAYS: '5', RETENTION_DELIVERED_EVIDENCE_DAYS: '365' })).toEqual({ cancelledCaseEvidenceDays: 90, closedCaseEvidenceDays: 365 });
 });
});
