import { describe, expect, it } from 'vitest';
import { buildCaseExport, findingsCsv } from './case-export';

const input = () => ({
 generatedBy: 'certifier:synthetic',
 now: new Date('2026-12-02T10:00:00Z'),
 apeCase: { id: 'case-1', status: 'INSPECTION_DONE' },
 property: { address: 'Via Sintetica 1', city: 'Bologna', region: 'Emilia-Romagna', floorAreaM2: 85 },
 inspection: { performedAt: new Date('2026-12-01T09:30:00Z'), report: { performedAt: '2026-12-01T09:30:00Z', attendees: 'Proprietario', declaration: true as const, findings: [
  { field: 'heating.generator.nominal_power_kw', status: 'verified' as const, value: 24, source: 'photo' as const, evidenceId: 'ev-1', note: '=HYPERLINK("http://evil")' },
  { field: 'envelope.wall.insulation', status: 'undeterminable' as const, source: 'inspection' as const, note: 'Nessun saggio, "parete" intonacata' },
 ] } },
 evidence: [{ id: 'ev-1', kind: 'boiler', mimeType: 'image/jpeg', sha256: 'a'.repeat(64), sizeBytes: 1000 }],
 reviewed: [
  { field: 'heating.generator.type', value: 'caldaia_condensazione', unit: null, status: 'accepted', modelId: 'm@1', evidenceId: 'ev-1' },
  { field: 'windows.frame', value: 'pvc', unit: null, status: 'rejected', modelId: 'm@1', evidenceId: 'ev-1' },
  { field: 'windows.glazing', value: 'doppio', unit: null, status: 'needs_review', modelId: 'm@1', evidenceId: 'ev-1' },
 ],
});

describe('calculation export', () => {
 it('produces a versioned document with provenance and no energy class', () => {
  const d = buildCaseExport(input());
  expect(d.schema).toBe('ape-italia/case-export');
  expect(d.version).toBe('1.0');
  expect(d.disclaimer).toMatch(/Non costituisce APE/);
  expect(JSON.stringify(d)).not.toMatch(/energyClass|classeEnergetica|EPgl/i);
  expect(d.inspection.findings[0]).toMatchObject({ unit: 'kW', value: 24, verification: 'verified', evidence: { id: 'ev-1', sha256: 'a'.repeat(64) } });
  expect(d.inspection.findings[1]).toMatchObject({ value: null, verification: 'undeterminable' });
 });
 it('marks the declared floor area as declared, not verified', () => {
  expect(buildCaseExport(input()).property).toMatchObject({ declaredFloorAreaM2: 85, declaredFloorAreaStatus: 'declared_by_requester' });
 });
 it('includes only reviewed-and-kept extractions, still flagged to_verify', () => {
  const r = buildCaseExport(input()).reviewedExtractions;
  expect(r.map(x => x.field)).toEqual(['heating.generator.type']);
  expect(r[0].verification).toBe('to_verify');
 });
 it('reports completeness over the whole vocabulary', () => {
  const c = buildCaseExport(input()).completeness;
  expect(c.find(x => x.field === 'heating.generator.nominal_power_kw')?.state).toBe('verified');
  expect(c.find(x => x.field === 'geometry.heated_area_m2')?.state).toBe('not_reported');
 });
 it('CSV neutralizes formula injection and quotes properly', () => {
  const csv = findingsCsv(buildCaseExport(input()));
  const lines = csv.trim().split('\r\n');
  expect(lines[0]).toBe('field,label,value,unit,verification,source,evidence_sha256,note');
  expect(lines[1]).toContain(`"'=HYPERLINK(""http://evil"")"`);
  expect(lines[2]).toContain('"Nessun saggio, ""parete"" intonacata"');
 });
});
