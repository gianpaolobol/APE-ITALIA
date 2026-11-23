import { describe, expect, it } from 'vitest';
import { APE_CODE, canDeliver, dossier, newCallUrl, verbaleErrors, type Job } from './job';

describe('certifier job', () => {
 it('APE cannot be delivered without an inspection report', () => {
  const j: Job = { status: 'accettata', certifier: { name: 'A B', sace: '05905' }, call: { at: new Date().toISOString(), url: newCallUrl() } };
  expect(canDeliver(j)).toBe(false);
  expect(canDeliver({ ...j, verbale: { date: '1/12/2026', start: '09:30', end: '10:15', attendees: 'Certificatore e proprietario', checks: ['misure', 'involucro', 'generatore'], notes: '', ownerName: 'Mario Rossi', ownerConfirmed: true, declaration: true, savedAt: '' } })).toBe(true);
 });
 it('report requires the minimum content and both confirmations', () => {
  expect(verbaleErrors({})).toHaveLength(8);
  expect(verbaleErrors({ date: 'x', start: '9:30', end: '10:15', attendees: 'abc', checks: ['a', 'b', 'c'], ownerName: 'Mario', ownerConfirmed: true, declaration: true })).toEqual(['Ora di inizio (hh:mm)']);
 });
 it('call links are unguessable Jitsi rooms', () => {
  expect(newCallUrl()).toMatch(/^https:\/\/meet\.jit\.si\/APEItalia-[a-z0-9]{16}$/);
  expect(newCallUrl()).not.toBe(newCallUrl());
 });
 it('APE code format and readable dossier without consents', () => {
  expect(APE_CODE.test('05905-012345-2026')).toBe(true);
  const d = dossier({ propertyType: 'appartamento', floorArea: 80, privacy: true, controls: ['valvole'], heatingSystem: 'autonomo', heatGenerator: 'caldaia_condensazione' });
  const rows = d.flatMap(g => g.rows);
  expect(rows.find(r => r.label === 'Tipo di immobile')?.value).toBe('Appartamento');
  expect(rows.find(r => r.value === 'Sì' && r.label.startsWith('Accetto'))).toBeUndefined();
 });
});
