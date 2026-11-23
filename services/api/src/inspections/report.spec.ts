import { describe, expect, it } from 'vitest';
import { validateReport, validateSchedule, FINDING_FIELDS } from './report';

const now = new Date('2026-12-01T12:00:00Z');
const scheduledAt = new Date('2026-12-01T09:00:00Z');
const valid = () => ({
 performedAt: '2026-12-01T09:30:00Z',
 attendees: 'Proprietario presente (dato sintetico)',
 declaration: true,
 findings: [
  { field: 'heating.generator.type', status: 'verified', value: 'caldaia_condensazione', source: 'inspection' },
  { field: 'heating.generator.nominal_power_kw', status: 'verified', value: 24, source: 'photo', evidenceId: '123e4567-e89b-42d3-a456-426614174000', note: 'Targhetta fotografata e confrontata sul posto' },
  { field: 'envelope.wall.thickness_cm', status: 'to_verify', value: 40, source: 'inspection', note: 'Misurato al vano finestra' },
  { field: 'envelope.wall.insulation', status: 'undeterminable', source: 'inspection', note: 'Nessun saggio consentito' },
 ],
});
const errs = (r: unknown) => { const v = validateReport(r, { scheduledAt, now }); return v.ok ? [] : v.errors.join(' | '); };

describe('inspection report validation', () => {
 it('accepts a well-formed report and normalizes it', () => {
  const r = validateReport(valid(), { scheduledAt, now });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.report.findings).toHaveLength(4);
 });
 it('requires the personal inspection declaration', () => expect(errs({ ...valid(), declaration: false })).toMatch(/declare/));
 it('rejects future or implausibly early performance dates', () => {
  expect(errs({ ...valid(), performedAt: '2026-12-02T10:00:00Z' })).toMatch(/future/);
  expect(errs({ ...valid(), performedAt: '2026-11-20T10:00:00Z' })).toMatch(/before the scheduled/);
 });
 it('rejects unknown fields, extra keys and duplicates', () => {
  expect(errs({ ...valid(), findings: [{ field: 'energy.class', status: 'verified', value: 'A4', source: 'inspection' }] })).toMatch(/unknown field/);
  expect(errs({ ...valid(), findings: [{ ...valid().findings[0], confidence: 0.99 }] })).toMatch(/invalid object/);
  expect(errs({ ...valid(), findings: [valid().findings[0], valid().findings[0]] })).toMatch(/duplicate/);
  expect(errs({ ...valid(), energyClass: 'A' })).toMatch(/Invalid report/);
 });
 it('refuses to record an energy class: the vocabulary has no such field', () => {
  expect(Object.keys(FINDING_FIELDS).some(k => /class|classe|epgl|ape/i.test(k))).toBe(false);
 });
 it('validates enum values and numeric ranges with units', () => {
  expect(errs({ ...valid(), findings: [{ field: 'windows.glazing', status: 'verified', value: 'quadruplo', source: 'inspection' }] })).toMatch(/one of/);
  expect(errs({ ...valid(), findings: [{ field: 'envelope.wall.thickness_cm', status: 'verified', value: 900, source: 'inspection' }] })).toMatch(/between 5 and 200 cm/);
  expect(errs({ ...valid(), findings: [{ field: 'heating.generator.install_year', status: 'verified', value: 2010.5, source: 'inspection' }] })).toMatch(/between/);
  expect(errs({ ...valid(), findings: [{ field: 'geometry.heated_area_m2', status: 'verified', value: '85', source: 'inspection' }] })).toMatch(/number/);
 });
 it('undeterminable findings carry no value but a reason', () => {
  expect(errs({ ...valid(), findings: [{ field: 'envelope.wall.insulation', status: 'undeterminable', value: 'assente', source: 'inspection', note: 'x y z' }] })).toMatch(/must not carry a value/);
  expect(errs({ ...valid(), findings: [{ field: 'envelope.wall.insulation', status: 'undeterminable', source: 'inspection' }] })).toMatch(/explain/);
 });
 it('values taken from photos or documents cannot be "verified" without a confirmation note', () => {
  expect(errs({ ...valid(), findings: [{ field: 'heating.generator.nominal_power_kw', status: 'verified', value: 24, source: 'photo' }] })).toMatch(/need a note/);
  expect(errs({ ...valid(), findings: [{ field: 'heating.generator.nominal_power_kw', status: 'to_verify', value: 24, source: 'photo' }] })).toEqual([]);
 });
 it('requires at least one finding and attendees', () => {
  expect(errs({ ...valid(), findings: [] })).toMatch(/1-200/);
  expect(errs({ ...valid(), attendees: '' })).toMatch(/attendees/);
 });
});

describe('inspection scheduling', () => {
 it('accepts a near-future date within 90 days', () => expect(validateSchedule('2026-12-05T09:00:00Z', now)).toBeInstanceOf(Date));
 it('rejects past, too-near or too-far dates and garbage', () => {
  expect(validateSchedule('2026-11-30T09:00:00Z', now)).toMatch(/future/);
  expect(validateSchedule('2026-12-01T12:05:00Z', now)).toMatch(/15 minutes/);
  expect(validateSchedule('2027-06-01T09:00:00Z', now)).toMatch(/90 days/);
  expect(validateSchedule('tomorrow', now)).toMatch(/ISO/);
 });
});
