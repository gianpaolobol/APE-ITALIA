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

import { reportFromVerbale } from './job';
describe('server report from verbale', () => {
 it('maps survey answers to vocabulary findings, verified only for ticked checks', () => {
  const r = reportFromVerbale({ heatGenerator: 'caldaia_condensazione', generatorYear: 2015, glazing: 'doppio', floorArea: 80, pv: false, wallInsulated: false },
   { date: '01/12/2026', start: '09:30', end: '10:15', attendees: 'Certificatore e proprietario', checks: ['generatore', 'misure'], notes: '', ownerName: 'Mario Rossi', ownerConfirmed: true, declaration: true, savedAt: '' });
  const by = Object.fromEntries(r.findings.map(f => [f.field, f]));
  expect(by['heating.generator.type']).toMatchObject({ value: 'caldaia_condensazione', status: 'verified' });
  expect(by['windows.glazing']).toMatchObject({ value: 'doppio', status: 'to_verify' });
  expect(by['geometry.heated_area_m2'].status).toBe('verified');
  expect(by['renewables.pv_kwp'].value).toBe(0);
  expect(new Date(r.performedAt).getFullYear()).toBe(2026);
  expect(r.declaration).toBe(true);
 });
});
