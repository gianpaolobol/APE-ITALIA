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

export type RegisterCertifierInput = { subject: string; displayName: string; registrationId: string; regions: string[]; operator: string; maxActiveAssignments?: number };

/**
 * Registers a certifier as verified. The operator must have checked the regional register of accredited
 * certifiers beforehand; this function records who did it and when, it does not perform the check.
 */
export async function registerVerifiedCertifier(db: PrismaClient, input: RegisterCertifierInput) {
 const subject = input.subject.trim();
 if (!/^[\x21-\x7e]{1,255}$/.test(subject)) throw new Error('Subject must be the OIDC "sub" claim');
 const displayName = input.displayName.trim();
 if (displayName.length < 2 || displayName.length > 200) throw new Error('Display name must be 2-200 characters');
 const registrationId = input.registrationId.trim();
 if (!/^[A-Za-z0-9/._-]{2,64}$/.test(registrationId)) throw new Error('Registration identifier required (as shown in the regional register)');
 const regions = [...new Set(input.regions.map(r => r.trim()).filter(Boolean))];
 if (!regions.length) throw new Error('At least one region required');
 if (!/^[A-Za-z0-9._@-]{2,100}$/.test(input.operator)) throw new Error('Operator identifier required for the audit trail');
 const max = input.maxActiveAssignments ?? 5;
 if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error('maxActiveAssignments must be 1-100');
 return db.certifier.upsert({
  where: { userSubject: subject },
  create: { userSubject: subject, displayName, registrationId, regions, maxActiveAssignments: max, verifiedAt: new Date(), verifiedBy: input.operator },
  update: { displayName, registrationId, regions, maxActiveAssignments: max, active: true, verifiedAt: new Date(), verifiedBy: input.operator },
 });
}
