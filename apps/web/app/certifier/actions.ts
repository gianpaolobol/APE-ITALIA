'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { config, readSession } from '../../lib/session';
import { ApiFailure, apiFetch, apiJson, type InspectionSchema } from '../../lib/api';
import { romeLocalToIso } from '../../lib/time';
import { reportFromForm } from '../../lib/report-form';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function context() {
 const cfg = config();
 if (!cfg) throw new Error('Portal not configured');
 const s = await readSession(cfg);
 if (!s) redirect('/auth/login?returnTo=/certifier');
 return { cfg, s };
}

/** Server actions: Next.js checks the Origin header, which protects them against CSRF. */
export async function acceptAssignment(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!UUID.test(id)) throw new Error('Invalid assignment');
 const { cfg, s } = await context();
 await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/accept`, { method: 'POST' });
 revalidatePath('/certifier');
 redirect(`/certifier/${id}`);
}

export async function declineAssignment(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!UUID.test(id)) throw new Error('Invalid assignment');
 const reason = String(form.get('reason') ?? '').slice(0, 500);
 const { cfg, s } = await context();
 await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/decline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
 revalidatePath('/certifier');
 redirect('/certifier');
}


export async function scheduleInspection(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!UUID.test(id)) throw new Error('Invalid assignment');
 const local = String(form.get('scheduledAt') ?? '');
 const { cfg, s } = await context();
 // datetime-local has no zone: the portal operates in Europe/Rome for the pilot region.
 const iso = romeLocalToIso(local);
 await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/inspection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt: iso }) });
 revalidatePath(`/certifier/${id}`);
}

export async function submitReport(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!UUID.test(id)) throw new Error('Invalid assignment');
 const { cfg, s } = await context();
 const schema = await apiJson<InspectionSchema>(cfg, s, '/v1/certifier/inspection-schema');
 const payload = reportFromForm(form, schema);
 if (typeof payload.performedAt === 'string' && payload.performedAt === '') throw new Error('Data del sopralluogo mancante');
 const local = String(form.get('performedAt'));
 payload.performedAt = romeLocalToIso(local);
 await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/inspection/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
 revalidatePath(`/certifier/${id}`);
}

export async function extractEvidence(form: FormData) {
 const id = String(form.get('id') ?? ''), evidenceId = String(form.get('evidenceId') ?? '');
 if (!UUID.test(id) || !UUID.test(evidenceId)) throw new Error('Invalid request');
 const { cfg, s } = await context();
 let msg = 'ok';
 try {
  await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/evidence/${evidenceId}/extract`, { method: 'POST' });
 } catch (e) {
  msg = e instanceof ApiFailure ? (e.status === 503 ? 'ai-off' : e.status === 423 ? 'unscanned' : e.status === 409 ? 'done' : 'error') : 'error';
 }
 redirect(`/certifier/${id}?extract=${msg}`);
}

export async function reviewExtracted(form: FormData) {
 const id = String(form.get('id') ?? ''), fieldId = String(form.get('fieldId') ?? '');
 if (!UUID.test(id) || !UUID.test(fieldId)) throw new Error('Invalid request');
 const action = String(form.get('action') ?? '');
 const raw = String(form.get('value') ?? '').trim();
 const body: Record<string, unknown> = { action, note: String(form.get('note') ?? '') };
 if (action === 'correct') body.value = form.get('numeric') === '1' ? Number(raw.replace(',', '.')) : raw;
 const { cfg, s } = await context();
 await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/extracted-fields/${fieldId}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
 revalidatePath(`/certifier/${id}`);
}

export async function uploadCertificate(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!UUID.test(id)) throw new Error('Invalid assignment');
 const file = form.get('file');
 if (!(file instanceof File) || file.size === 0) redirect(`/certifier/${id}?cert=missing`);
 const { cfg, s } = await context();
 const out = new FormData();
 out.set('regionalId', String(form.get('regionalId') ?? ''));
 out.set('depositedAt', romeLocalToIso(String(form.get('depositedAt') ?? '')));
 const valid = String(form.get('validUntil') ?? '');
 if (valid) out.set('validUntil', new Date(valid + 'T00:00:00Z').toISOString());
 out.set('declaration', form.get('declaration') === 'on' ? 'true' : 'false');
 out.set('file', file as File, 'ape.pdf');
 let msg = 'ok';
 try { await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/certificate`, { method: 'POST', body: out }); }
 catch (e) { msg = e instanceof ApiFailure ? ({ 400: 'invalid', 409: 'conflict', 413: 'too-large', 415: 'not-pdf' } as Record<number, string>)[e.status] ?? 'error' : 'error'; }
 redirect(`/certifier/${id}?cert=${msg}`);
}

export async function requestEvidence(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!UUID.test(id)) throw new Error('Invalid assignment');
 const { cfg, s } = await context();
 let msg = 'req-ok';
 try { await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/evidence-requests`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: String(form.get('message') ?? ''), kinds: form.getAll('kinds').map(String) }) }); }
 catch (e) { msg = e instanceof ApiFailure && e.status === 409 ? 'req-state' : 'req-invalid'; }
 redirect(`/certifier/${id}?cert=${msg}`);
}

export async function withdrawAssignment(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!UUID.test(id)) throw new Error('Invalid assignment');
 const { cfg, s } = await context();
 await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/withdraw`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: String(form.get('reason') ?? '') }) });
 revalidatePath('/certifier');
 redirect('/certifier');
}
