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
