import { describe, expect, it } from 'vitest';
import { sanitizeCandidates } from './provider';

describe('untrusted provider output', () => {
 it('keeps only vocabulary fields with valid values and clamps confidence', () => {
  const r = sanitizeCandidates([
   { field: 'windows.frame', value: 'pvc', confidence: 0.8 },
   { field: 'envelope.wall.thickness_cm', value: 35, confidence: -3 },
   { field: 'energy.class', value: 'G' },
   { field: 'windows.frame', value: 'legno' },
   { field: 'geometry.heated_area_m2', value: '85' },
   { field: '__proto__', value: 1 },
   null,
  ]);
  expect(r.accepted).toEqual([
   { field: 'windows.frame', value: 'pvc', unit: null, confidence: 0.8 },
   { field: 'envelope.wall.thickness_cm', value: 35, unit: 'cm', confidence: 0 },
  ]);
  expect(r.rejected).toBe(5);
 });
 it('treats non-array output as a single rejected item', () => expect(sanitizeCandidates({ text: 'Classe A' })).toEqual({ accepted: [], rejected: 1 }));
 it('caps the number of candidates', () => {
  const r = sanitizeCandidates(Array.from({ length: 150 }, () => ({ field: 'windows.frame', value: 'pvc' })));
  expect(r.accepted).toHaveLength(1);
  expect(r.rejected).toBe(149);
 });
});
