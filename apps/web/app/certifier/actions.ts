'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { config, readSession } from '../../lib/session';
import { apiFetch, apiJson, type InspectionSchema } from '../../lib/api';
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
