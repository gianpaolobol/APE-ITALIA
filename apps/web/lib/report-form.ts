import type { InspectionSchema } from './api';

/**
 * Converts the HTML form into the API report payload. Rows left on "skip" are omitted; nothing is
 * pre-filled or guessed: the certifier must choose a status for every reported field.
 */
export function reportFromForm(form: FormData, schema: InspectionSchema): Record<string, unknown> {
 const findings: Record<string, unknown>[] = [];
 for (const [field, spec] of Object.entries(schema.fields)) {
  const status = String(form.get(`${field}.status`) ?? 'skip');
  if (status === 'skip') continue;
  const raw = String(form.get(`${field}.value`) ?? '').trim();
  const note = String(form.get(`${field}.note`) ?? '').trim();
  const source = String(form.get(`${field}.source`) ?? 'inspection');
  const f: Record<string, unknown> = { field, status, source };
  if (status !== 'undeterminable' && raw !== '') f.value = spec.kind === 'number' ? Number(raw.replace(',', '.')) : raw;
  if (note) f.note = note;
  findings.push(f);
 }
 const performed = String(form.get('performedAt') ?? '');
 return {
  performedAt: performed ? new Date(performed).toISOString() : '',
  attendees: String(form.get('attendees') ?? ''),
  ...(String(form.get('generalNotes') ?? '').trim() ? { generalNotes: String(form.get('generalNotes')).trim() } : {}),
  declaration: form.get('declaration') === 'on',
  findings,
 };
}
