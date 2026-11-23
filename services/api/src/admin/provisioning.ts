import type { PrismaClient } from '@prisma/client';

export type CreateOrganizationInput = { name: string; ownerSubject: string; operator: string };

/**
 * Operator-only bootstrap: creates an organization and its first owner in one transaction, with audit.
 * Not exposed over HTTP: run from a trusted shell with database credentials (see docs/PROVISIONING.md).
 */
export async function createOrganizationWithOwner(db: PrismaClient, input: CreateOrganizationInput) {
 const name = input.name.trim();
 const ownerSubject = input.ownerSubject.trim();
 const operator = input.operator.trim();
 if (name.length < 2 || name.length > 200) throw new Error('Organization name must be 2-200 characters');
 if (!/^[\x21-\x7e]{1,255}$/.test(ownerSubject)) throw new Error('Owner subject must be the OIDC "sub" claim (printable ASCII, no spaces)');
 if (!/^[A-Za-z0-9._@-]{2,100}$/.test(operator)) throw new Error('Operator identifier required for the audit trail');
 return db.$transaction(async tx => {
  const org = await tx.organization.create({ data: { name } });
  const membership = await tx.membership.create({ data: { organizationId: org.id, userSubject: ownerSubject, role: 'owner' } });
  await tx.auditEvent.create({ data: { organizationId: org.id, actorId: `operator:${operator}`, action: 'organization.create', resourceId: org.id } });
  await tx.auditEvent.create({ data: { organizationId: org.id, actorId: `operator:${operator}`, action: 'membership.create', resourceId: membership.id } });
  return { organizationId: org.id, membershipId: membership.id };
 });
}

export function parseArgs(argv: string[]): Record<string, string> {
 const out: Record<string, string> = {};
 for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) continue;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`Missing value for ${a}`);
  out[a.slice(2)] = v;
  i++;
 }
 return out;
}
