/**
 * Structured inspection report (verbale di sopralluogo). Every finding carries an explicit verification
 * status (MASTER_PLAN §2): the platform never fills or infers technical values.
 */
type FieldSpec =
 | { label: string; kind: 'enum'; values: readonly string[] }
 | { label: string; kind: 'number'; unit: string; min: number; max: number; integer?: boolean };

export const FINDING_FIELDS: Record<string, FieldSpec> = {
 'heating.generator.type': { label: 'Generatore riscaldamento', kind: 'enum', values: ['caldaia_condensazione', 'caldaia_tradizionale', 'pompa_di_calore', 'teleriscaldamento', 'biomassa', 'stufa_elettrica', 'altro'] },
 'heating.generator.nominal_power_kw': { label: 'Potenza nominale generatore', kind: 'number', unit: 'kW', min: 0.5, max: 5000 },
 'heating.generator.install_year': { label: 'Anno installazione generatore', kind: 'number', unit: 'anno', min: 1900, max: 2100, integer: true },
 'heating.emitters.type': { label: 'Terminali di emissione', kind: 'enum', values: ['radiatori', 'pannelli_radianti', 'ventilconvettori', 'bocchette_aria', 'altro'] },
 'heating.regulation': { label: 'Regolazione', kind: 'enum', values: ['climatica', 'termostato_ambiente', 'valvole_termostatiche', 'climatica_e_zona', 'nessuna'] },
 'dhw.generator.type': { label: 'Produzione acqua calda sanitaria', kind: 'enum', values: ['combinata_riscaldamento', 'boiler_elettrico', 'pompa_di_calore', 'solare_termico', 'altro'] },
 'cooling.present': { label: 'Climatizzazione estiva', kind: 'enum', values: ['assente', 'split', 'centralizzata', 'pompa_di_calore_reversibile'] },
 'envelope.wall.type': { label: 'Tipologia pareti esterne', kind: 'enum', values: ['muratura_piena', 'laterizio_forato', 'cemento_armato', 'blocchi_cls', 'legno', 'altro'] },
 'envelope.wall.thickness_cm': { label: 'Spessore pareti esterne', kind: 'number', unit: 'cm', min: 5, max: 200 },
 'envelope.wall.insulation': { label: 'Isolamento pareti', kind: 'enum', values: ['assente', 'cappotto_esterno', 'interno', 'intercapedine'] },
 'envelope.roof.insulation': { label: 'Isolamento copertura/sottotetto', kind: 'enum', values: ['assente', 'presente', 'non_pertinente'] },
 'envelope.floor.insulation': { label: 'Isolamento solaio inferiore', kind: 'enum', values: ['assente', 'presente', 'non_pertinente'] },
 'windows.frame': { label: 'Telaio serramenti', kind: 'enum', values: ['legno', 'pvc', 'alluminio', 'alluminio_taglio_termico', 'ferro', 'misto'] },
 'windows.glazing': { label: 'Vetro serramenti', kind: 'enum', values: ['singolo', 'doppio', 'doppio_basso_emissivo', 'triplo'] },
 'geometry.heated_area_m2': { label: 'Superficie utile riscaldata', kind: 'number', unit: 'm²', min: 1, max: 100000 },
 'geometry.heated_volume_m3': { label: 'Volume lordo riscaldato', kind: 'number', unit: 'm³', min: 1, max: 1000000 },
 'renewables.pv_kwp': { label: 'Fotovoltaico', kind: 'number', unit: 'kWp', min: 0, max: 10000 },
};

export const VERIFICATION_STATUSES = ['verified', 'to_verify', 'undeterminable'] as const;
export const FINDING_SOURCES = ['inspection', 'document', 'photo'] as const;

export type Finding = { field: string; status: (typeof VERIFICATION_STATUSES)[number]; value?: string | number; source: (typeof FINDING_SOURCES)[number]; evidenceId?: string; note?: string };
export type InspectionReport = { performedAt: string; attendees: string; findings: Finding[]; generalNotes?: string; declaration: true };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const only = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every(k => keys.includes(k));

/** Returns a normalized report or a list of human-readable errors. */
export function validateReport(input: unknown, ctx: { scheduledAt: Date; now: Date }): { ok: true; report: InspectionReport } | { ok: false; errors: string[] } {
 const errors: string[] = [];
 if (!isObj(input) || !only(input, ['performedAt', 'attendees', 'findings', 'generalNotes', 'declaration'])) return { ok: false, errors: ['Invalid report object'] };
 if (input.declaration !== true) errors.push('The certifier must declare having personally performed the inspection');
 const performedAt = typeof input.performedAt === 'string' ? new Date(input.performedAt) : new Date(NaN);
 if (Number.isNaN(performedAt.getTime())) errors.push('performedAt must be an ISO date');
 else {
  if (performedAt.getTime() > ctx.now.getTime() + 5 * 60_000) errors.push('performedAt cannot be in the future');
  if (performedAt.getTime() < ctx.scheduledAt.getTime() - 24 * 3600_000) errors.push('performedAt is more than one day before the scheduled date');
 }
 if (typeof input.attendees !== 'string' || input.attendees.trim().length < 2 || input.attendees.length > 300) errors.push('attendees required (2-300 characters)');
 if (input.generalNotes !== undefined && (typeof input.generalNotes !== 'string' || input.generalNotes.length > 4000)) errors.push('generalNotes max 4000 characters');
 if (!Array.isArray(input.findings) || input.findings.length === 0 || input.findings.length > 200) errors.push('findings must contain 1-200 items');
 const findings: Finding[] = [];
 const seen = new Set<string>();
 (Array.isArray(input.findings) ? input.findings : []).forEach((f, i) => {
  const at = `findings[${i}]`;
  if (!isObj(f) || !only(f, ['field', 'status', 'value', 'source', 'evidenceId', 'note'])) { errors.push(`${at}: invalid object`); return; }
  const spec = typeof f.field === 'string' ? FINDING_FIELDS[f.field] : undefined;
  if (!spec || !Object.hasOwn(FINDING_FIELDS, f.field as string)) { errors.push(`${at}: unknown field`); return; }
  if (seen.has(f.field as string)) { errors.push(`${at}: duplicate field ${f.field}`); return; }
  seen.add(f.field as string);
  if (!(VERIFICATION_STATUSES as readonly unknown[]).includes(f.status)) { errors.push(`${at}: invalid status`); return; }
  if (!(FINDING_SOURCES as readonly unknown[]).includes(f.source)) { errors.push(`${at}: invalid source`); return; }
  if (f.note !== undefined && (typeof f.note !== 'string' || f.note.length > 1000)) { errors.push(`${at}: note max 1000 characters`); return; }
  if (f.evidenceId !== undefined && (typeof f.evidenceId !== 'string' || !UUID.test(f.evidenceId))) { errors.push(`${at}: invalid evidenceId`); return; }
  if (f.status === 'undeterminable') {
   if (f.value !== undefined) { errors.push(`${at}: undeterminable findings must not carry a value`); return; }
   if (typeof f.note !== 'string' || f.note.trim().length < 3) { errors.push(`${at}: explain why the value cannot be determined`); return; }
  } else {
   if (spec.kind === 'enum' && (typeof f.value !== 'string' || !spec.values.includes(f.value))) { errors.push(`${at}: value must be one of ${spec.values.join(', ')}`); return; }
   if (spec.kind === 'number') {
    if (typeof f.value !== 'number' || !Number.isFinite(f.value) || f.value < spec.min || f.value > spec.max || (spec.integer && !Number.isInteger(f.value))) { errors.push(`${at}: value must be a number between ${spec.min} and ${spec.max} ${spec.unit}`); return; }
   }
  }
  // A value seen only in a photo or a document cannot be marked verified without on-site confirmation.
  if (f.status === 'verified' && f.source !== 'inspection' && (typeof f.note !== 'string' || f.note.trim().length < 3)) { errors.push(`${at}: verified values from photos/documents need a note on how they were confirmed`); return; }
  findings.push({ field: f.field as string, status: f.status as Finding['status'], source: f.source as Finding['source'],
   ...(f.value !== undefined ? { value: f.value as string | number } : {}), ...(f.evidenceId ? { evidenceId: f.evidenceId as string } : {}), ...(f.note ? { note: (f.note as string).trim() } : {}) });
 });
 if (errors.length) return { ok: false, errors };
 return { ok: true, report: { performedAt: performedAt.toISOString(), attendees: (input.attendees as string).trim(), findings, ...(input.generalNotes ? { generalNotes: (input.generalNotes as string).trim() } : {}), declaration: true } };
}

export const MAX_SCHEDULE_DAYS = 90;
export function validateSchedule(value: unknown, now: Date): Date | string {
 if (typeof value !== 'string') return 'scheduledAt must be an ISO date';
 const d = new Date(value);
 if (Number.isNaN(d.getTime())) return 'scheduledAt must be an ISO date';
 if (d.getTime() < now.getTime() + 15 * 60_000) return 'scheduledAt must be at least 15 minutes in the future';
 if (d.getTime() > now.getTime() + MAX_SCHEDULE_DAYS * 86400_000) return `scheduledAt must be within ${MAX_SCHEDULE_DAYS} days`;
 return d;
}
