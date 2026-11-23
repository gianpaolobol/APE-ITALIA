import { describe, expect, it } from 'vitest';
import { exclusionReason, rankCandidates, type Candidate } from './matching';

const base = (over: Partial<Candidate> = {}): Candidate => ({
 id: 'c1', userSubject: 'sub-1', regions: ['Emilia-Romagna'], active: true, verifiedAt: new Date('2026-01-01'), maxActiveAssignments: 5, activeAssignments: 0, ...over,
});
const ctx = { region: 'Emilia-Romagna', requesterSubjects: new Set(['customer']), previouslyOffered: new Set<string>() };

describe('mandatory matching filters', () => {
 it('accepts an eligible certifier', () => expect(exclusionReason(base(), ctx)).toBeNull());
 it('excludes inactive and unverified certifiers', () => {
  expect(exclusionReason(base({ active: false }), ctx)).toBe('inactive');
  expect(exclusionReason(base({ verifiedAt: null }), ctx)).toBe('unverified');
 });
 it('excludes other regions; region match is case/space-insensitive', () => {
  expect(exclusionReason(base({ regions: ['Lombardia'] }), ctx)).toBe('region');
  expect(exclusionReason(base({ regions: [' emilia-romagna '] }), ctx)).toBeNull();
 });
 it('excludes certifiers belonging to the requesting organization (independence)', () => {
  expect(exclusionReason(base({ userSubject: 'customer' }), ctx)).toBe('conflict_of_interest');
 });
 it('never re-offers to a certifier who already had the case', () => {
  expect(exclusionReason(base(), { ...ctx, previouslyOffered: new Set(['c1']) })).toBe('already_offered');
 });
 it('respects capacity', () => expect(exclusionReason(base({ activeAssignments: 5 }), ctx)).toBe('capacity'));
});

describe('ranking', () => {
 it('prefers lower relative load, then seniority, deterministically', () => {
  const ranked = rankCandidates([
   base({ id: 'busy', activeAssignments: 4 }),
   base({ id: 'new', verifiedAt: new Date('2026-06-01'), activeAssignments: 1 }),
   base({ id: 'senior', verifiedAt: new Date('2025-01-01'), activeAssignments: 1 }),
   base({ id: 'big', maxActiveAssignments: 20, activeAssignments: 2 }),
   base({ id: 'out', regions: ['Veneto'] }),
  ], ctx);
  expect(ranked.map(c => c.id)).toEqual(['big', 'senior', 'new', 'busy']);
 });
 it('returns an empty list when nobody is eligible', () => expect(rankCandidates([base({ active: false })], ctx)).toEqual([]));
});
