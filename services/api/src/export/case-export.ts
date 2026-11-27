import { FINDING_FIELDS, type Finding, type InspectionReport } from '../inspections/report';

/**
 * Structured hand-off to conformant energy calculation software (MASTER_PLAN §11). This is input
 * data for the certifier's calculation, not a certificate: no class or performance index is produced.
 */
export const EXPORT_SCHEMA = 'ape-italia/case-export';
export const EXPORT_VERSION = '1.0';

export type ExportInput = {
 generatedBy: string;
 now: Date;
 apeCase: { id: string; status: string };
 property: { address: string; city: string; region: string; floorAreaM2: number | null };
 inspection: { performedAt: Date; report: InspectionReport };
 evidence: { id: string; kind: string; mimeType: string; sha256: string; sizeBytes: number }[];
 reviewed: { field: string; value: unknown; unit: string | null; status: string; modelId: string; evidenceId: string }[];
};

export function buildCaseExport(i: ExportInput) {
 const byId = new Map(i.evidence.map(e => [e.id, e]));
 const findings = i.inspection.report.findings.map((f: Finding) => {
  const spec = FINDING_FIELDS[f.field];
  const ev = f.evidenceId ? byId.get(f.evidenceId) : undefined;
  return {
   field: f.field, label: spec?.label ?? f.field, unit: spec && spec.kind === 'number' ? spec.unit : null,
   value: f.value ?? null, verification: f.status, source: f.source, note: f.note ?? null,
   evidence: ev ? { id: ev.id, sha256: ev.sha256 } : null,
  };
 });
 const reported = new Map(findings.map(f => [f.field, f.verification]));
 const completeness = Object.keys(FINDING_FIELDS).map(field => ({ field, state: reported.get(field) ?? 'not_reported' }));
 return {
  schema: EXPORT_SCHEMA,
  version: EXPORT_VERSION,
  generatedAt: i.now.toISOString(),
  generatedBy: i.generatedBy,
  disclaimer: 'Dati di input per software di calcolo conforme (UNI/TS 11300). Non costituisce APE: classe energetica, calcolo, firma e deposito competono al certificatore abilitato.',
  case: { id: i.apeCase.id, status: i.apeCase.status },
  property: {
   address: i.property.address, city: i.property.city, region: i.property.region,
   declaredFloorAreaM2: i.property.floorAreaM2, declaredFloorAreaStatus: 'declared_by_requester',
  },
  inspection: { performedAt: i.inspection.performedAt.toISOString(), attendees: i.inspection.report.attendees, generalNotes: i.inspection.report.generalNotes ?? null, findings },
  reviewedExtractions: i.reviewed.filter(r => r.status === 'accepted' || r.status === 'corrected').map(r => ({
   field: r.field, value: r.value, unit: r.unit, reviewOutcome: r.status, modelId: r.modelId, evidenceId: r.evidenceId,
   verification: 'to_verify' as const, // a reviewed document value is still not an on-site verification
  })),
  evidence: i.evidence.map(e => ({ id: e.id, kind: e.kind, mimeType: e.mimeType, sha256: e.sha256, sizeBytes: e.sizeBytes })),
  completeness,
 };
}

/** RFC 4180 CSV of the findings, with spreadsheet formula injection neutralized. */
export function findingsCsv(doc: ReturnType<typeof buildCaseExport>): string {
 const cell = (v: unknown) => {
  let s = v === null || v === undefined ? '' : String(v);
  // Normalize only for detection: preserve the original report text and JSON export.
  // Some spreadsheet imports ignore leading whitespace/control characters or fold full-width operators.
  const probe = s.normalize('NFKC');
  if (/^[\t\r\n]|^[\s\p{Cc}\p{Cf}]*[=+\-@]/u.test(probe)) s = "'" + s;
  return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
 };
 const head = ['field', 'label', 'value', 'unit', 'verification', 'source', 'evidence_sha256', 'note'];
 const rows = doc.inspection.findings.map(f => [f.field, f.label, f.value, f.unit, f.verification, f.source, f.evidence?.sha256 ?? '', f.note]);
 return [head, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
