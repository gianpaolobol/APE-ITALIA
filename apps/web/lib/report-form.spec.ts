import { describe, expect, it } from 'vitest';
import { reportFromForm } from './report-form';

const schema = { statuses: [], sources: [], fields: {
 'windows.glazing': { label: 'Vetro', kind: 'enum' as const, values: ['singolo', 'doppio'] },
 'envelope.wall.thickness_cm': { label: 'Spessore', kind: 'number' as const, unit: 'cm', min: 5, max: 200 },
 'heating.regulation': { label: 'Regolazione', kind: 'enum' as const, values: ['nessuna'] },
} };
describe('report form mapping', () => {
 it('omits skipped rows, parses decimal commas and drops values of undeterminable rows', () => {
  const f = new FormData();
  f.set('performedAt', '2026-12-01T10:00'); f.set('attendees', 'Proprietario'); f.set('declaration', 'on');
  f.set('windows.glazing.status', 'verified'); f.set('windows.glazing.value', 'doppio'); f.set('windows.glazing.source', 'inspection');
  f.set('envelope.wall.thickness_cm.status', 'to_verify'); f.set('envelope.wall.thickness_cm.value', '38,5'); f.set('envelope.wall.thickness_cm.source', 'inspection');
  f.set('heating.regulation.status', 'undeterminable'); f.set('heating.regulation.value', 'nessuna'); f.set('heating.regulation.note', 'Centrale termica chiusa');
  const r = reportFromForm(f, schema);
  expect(r.declaration).toBe(true);
  expect(r.findings).toEqual([
   { field: 'windows.glazing', status: 'verified', source: 'inspection', value: 'doppio' },
   { field: 'envelope.wall.thickness_cm', status: 'to_verify', source: 'inspection', value: 38.5 },
   { field: 'heating.regulation', status: 'undeterminable', source: 'inspection', note: 'Centrale termica chiusa' },
  ]);
 });
 it('never sets the declaration unless the box is ticked', () => {
  const f = new FormData();
  expect(reportFromForm(f, schema).declaration).toBe(false);
  expect(reportFromForm(f, schema).findings).toEqual([]);
 });
});
