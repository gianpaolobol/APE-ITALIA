import { describe, expect, it } from 'vitest';
import { apeCodeMatchesCertifier, normalizeSaceNumber, validSace, validVat, validateRegistration } from './registration';

describe('certifier registration', () => {
 it('validates Italian VAT check digit', () => { expect(validVat('01114601006')).toBe(true); expect(validVat('01114601007')).toBe(false); });
 it('SACE number is up to 5 digits, zero-padded', () => {
  expect(validSace('5990')).toBe(true); expect(normalizeSaceNumber('5990')).toBe('05990'); expect(validSace('123456')).toBe(false); expect(validSace('AB12')).toBe(false);
 });
 it('APE code prefix must match the accreditation number', () => {
  expect(apeCodeMatchesCertifier('05990-034798-2026', '5990')).toBe(true);
  expect(apeCodeMatchesCertifier('05991-034798-2026', '05990')).toBe(false);
 });
 it('SACE number is mandatory', () => {
  const e = validateRegistration({ firstName: 'A', lastName: 'B', email: 'a@b.it', phone: '3331234567', vatNumber: '01114601006', taxCode: 'RSSMRA80A01A944I', professionalOrder: 'BO', orderNumber: '1', profession: 'architetto', provinces: ['BO'], acceptsTerms: true, declaresAccreditation: true });
  expect(e.saceNumber).toBeTruthy();
 });
});
