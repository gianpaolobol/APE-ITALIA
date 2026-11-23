'use server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ORG_COOKIE, isUuid, orgContext } from '../../lib/org';
import { ApiFailure, orgFetch, orgJson } from '../../lib/api';

export async function chooseOrganization(form: FormData) {
 const org = String(form.get('organizationId') ?? '');
 const ctx = await orgContext('/org');
 if (!ctx || !isUuid(org) || !ctx.me.memberships.some(m => m.organizationId === org)) throw new Error('Organization not available');
 (await cookies()).set(ORG_COOKIE, org, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
 redirect('/org');
}

async function manager() {
 const ctx = await orgContext('/org/members');
 if (!ctx?.membership || !['owner', 'admin'].includes(ctx.membership.role)) throw new Error('Owner or admin required');
 return { ...ctx, org: ctx.membership.organizationId };
}

export type InviteState = { code?: string; expiresAt?: string; error?: string };
/** Returns the one-time code to the client component: it is shown once and never stored by the portal. */
export async function createInvitation(_prev: InviteState, form: FormData): Promise<InviteState> {
 const role = String(form.get('role') ?? '');
 const ttlHours = Number(form.get('ttlHours') ?? 72);
 const { cfg, s, org } = await manager();
 try {
  const r = await orgJson<{ code: string; expiresAt: string }>(cfg, s, org, '/v1/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, ttlHours }) });
  revalidatePath('/org/members');
  return { code: r.code, expiresAt: r.expiresAt };
 } catch (e) {
  return { error: e instanceof ApiFailure && e.status === 403 ? 'Non puoi assegnare questo ruolo.' : 'Invito non creato.' };
 }
}

export async function revokeInvitation(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!isUuid(id)) throw new Error('Invalid invitation');
 const { cfg, s, org } = await manager();
 await orgFetch(cfg, s, org, `/v1/invitations/${id}`, { method: 'DELETE' });
 revalidatePath('/org/members');
}

export async function updateMember(form: FormData) {
 const id = String(form.get('id') ?? '');
 if (!isUuid(id)) throw new Error('Invalid member');
 const body: Record<string, unknown> = {};
 const role = form.get('role'); if (role) body.role = String(role);
 const active = form.get('active'); if (active !== null) body.active = active === 'true';
 const { cfg, s, org } = await manager();
 let msg = 'ok';
 try { await orgFetch(cfg, s, org, `/v1/members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
 catch (e) { msg = e instanceof ApiFailure ? (e.status === 409 ? 'last-owner' : e.status === 403 ? 'forbidden' : 'error') : 'error'; }
 redirect('/org/members?result=' + msg);
}

async function writer(path: string) {
 const ctx = await orgContext(path);
 if (!ctx?.membership || !['owner', 'admin', 'member'].includes(ctx.membership.role)) throw new Error('Write access required');
 return { ...ctx, org: ctx.membership.organizationId };
}

export async function resolveEvidenceRequest(form: FormData) {
 const id = String(form.get('caseId') ?? ''), rid = String(form.get('requestId') ?? '');
 if (!isUuid(id) || !isUuid(rid)) throw new Error('Invalid request');
 const { cfg, s, org } = await writer(`/org/cases/${id}`);
 await orgFetch(cfg, s, org, `/v1/cases/${id}/evidence-requests/${rid}/resolve`, { method: 'POST' });
 revalidatePath(`/org/cases/${id}`);
}

export async function cancelCase(form: FormData) {
 const id = String(form.get('caseId') ?? '');
 if (!isUuid(id)) throw new Error('Invalid case');
 const { cfg, s, org } = await writer(`/org/cases/${id}`);
 await orgFetch(cfg, s, org, `/v1/cases/${id}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: String(form.get('reason') ?? '') }) });
 revalidatePath(`/org/cases/${id}`);
}

const KINDS = ['boiler', 'heating', 'envelope', 'window', 'floorplan', 'document'];

/** Creates property + draft case for the selected organization (member or above). */
export async function createCase(form: FormData) {
 const { cfg, s, org } = await writer('/org/new');
 const area = String(form.get('floorAreaM2') ?? '').trim().replace(',', '.');
 const property = { address: String(form.get('address') ?? '').trim(), city: String(form.get('city') ?? '').trim(), region: String(form.get('region') ?? '').trim(), ...(area ? { floorAreaM2: Number(area) } : {}) };
 let caseId = '';
 try {
  const p = await orgJson<{ id: string }>(cfg, s, org, '/v1/properties', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(property) });
  caseId = (await orgJson<{ id: string }>(cfg, s, org, '/v1/cases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: p.id }) })).id;
 } catch (e) {
  redirect('/org/new?error=' + (e instanceof ApiFailure && e.status === 400 ? 'invalid' : 'error'));
 }
 redirect(`/org/cases/${caseId}`);
}

export async function giveConsent(form: FormData) {
 const id = String(form.get('caseId') ?? '');
 if (!isUuid(id)) throw new Error('Invalid case');
 const { cfg, s, org } = await writer(`/org/cases/${id}`);
 const notices = await orgJson<{ evidence_processing: string }>(cfg, s, org, '/v1/notices');
 await orgFetch(cfg, s, org, `/v1/cases/${id}/consents`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'evidence_processing', version: notices.evidence_processing }) });
 redirect(`/org/cases/${id}?msg=consent`);
}

export async function uploadEvidence(form: FormData) {
 const id = String(form.get('caseId') ?? '');
 if (!isUuid(id)) throw new Error('Invalid case');
 const kind = String(form.get('kind') ?? '');
 const file = form.get('file');
 if (!KINDS.includes(kind) || !(file instanceof File) || file.size === 0) redirect(`/org/cases/${id}?msg=upload-missing`);
 const { cfg, s, org } = await writer(`/org/cases/${id}`);
 const out = new FormData();
 out.set('kind', kind);
 out.set('file', file as File, 'file');
 let msg = 'upload-ok';
 try { await orgFetch(cfg, s, org, `/v1/cases/${id}/evidence`, { method: 'POST', body: out }); }
 catch (e) { msg = 'upload-' + (e instanceof ApiFailure ? e.status : 'error'); }
 redirect(`/org/cases/${id}?msg=${msg}`);
}

export async function submitCase(form: FormData) {
 const id = String(form.get('caseId') ?? '');
 if (!isUuid(id)) throw new Error('Invalid case');
 const { cfg, s, org } = await writer(`/org/cases/${id}`);
 let msg = 'submitted';
 try { await orgFetch(cfg, s, org, `/v1/cases/${id}/submit`, { method: 'POST' }); } catch { msg = 'submit-error'; }
 redirect(`/org/cases/${id}?msg=${msg}`);
}
