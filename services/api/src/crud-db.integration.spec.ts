import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CasesController } from './cases.controller';
import type { AuthService } from './auth.service';
import { CURRENT_NOTICES } from './evidence/consent-policy';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: draft CRUD rules', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const org = randomUUID(), other = randomUUID();
 let role = 'member';
 const auth = { authorize: async (_t?: string, o?: string) => ({ organizationId: o!, actorId: 'crud-test-subject', role }) } as AuthService;
 const c = new CasesController(db as never, auth);
 beforeAll(async () => { await db.organization.createMany({ data: [{ id: org, name: 'CRUD tenant' }, { id: other, name: 'Other' }] }); });
 afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await db.consent.deleteMany({ where: { organizationId: org } });
  await db.apeCase.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await db.property.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await db.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await db.$disconnect();
 });

 it('reads, updates and deletes drafts within the tenant only', async () => {
  const p = await c.createProperty({ address: 'Via Bozza 1', city: 'Bologna', region: 'Emilia-Romagna' }, 'Bearer t', org);
  expect((await c.getProperty(p.id, 'Bearer t', org)).address).toBe('Via Bozza 1');
  await expect(c.getProperty(p.id, 'Bearer t', other)).rejects.toBeInstanceOf(NotFoundException);
  expect((await c.updateProperty(p.id, { address: 'Via Bozza 2', floorAreaM2: 64 }, 'Bearer t', org)).floorAreaM2).toBe(64);
  await expect(c.updateProperty(p.id, {}, 'Bearer t', org)).rejects.toBeInstanceOf(BadRequestException);
  await expect(c.updateProperty(p.id, { organizationId: other }, 'Bearer t', org)).rejects.toBeInstanceOf(BadRequestException);
  await expect(c.updateProperty(p.id, { city: 'X' }, 'Bearer t', other)).rejects.toBeInstanceOf(NotFoundException);
  const draft = await c.createCase({ propertyId: p.id }, 'Bearer t', org);
  expect((await c.getCase(draft.id, 'Bearer t', org)).property.address).toBe('Via Bozza 2');
  await expect(c.deleteProperty(p.id, 'Bearer t', org)).rejects.toBeInstanceOf(ConflictException);
  await c.deleteCase(draft.id, 'Bearer t', org);
  await c.deleteProperty(p.id, 'Bearer t', org);
  expect(await db.auditEvent.count({ where: { organizationId: org, action: { in: ['property.update', 'case.delete', 'property.delete'] } } })).toBe(3);
 });

 it('locks declared data after submission and refuses deleting non-empty or submitted cases', async () => {
  const p = await c.createProperty({ address: 'Via Bozza 3', city: 'Bologna', region: 'Regione-Senza-Certificatori' }, 'Bearer t', org);
  const withConsent = await c.createCase({ propertyId: p.id }, 'Bearer t', org);
  await db.consent.create({ data: { organizationId: org, caseId: withConsent.id, subject: 'crud-test-subject', kind: 'evidence_processing', version: 'v' } });
  await expect(c.deleteCase(withConsent.id, 'Bearer t', org)).rejects.toBeInstanceOf(ConflictException);
  const submitted = await c.createCase({ propertyId: p.id }, 'Bearer t', org);
  await db.consent.create({ data: { organizationId: org, caseId: submitted.id, subject: 'crud-test-subject', kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing } });
  await c.submitCase(submitted.id, 'Bearer t', org);
  await expect(c.updateProperty(p.id, { address: 'Altro' }, 'Bearer t', org)).rejects.toBeInstanceOf(ConflictException);
  await expect(c.deleteCase(submitted.id, 'Bearer t', org)).rejects.toBeInstanceOf(ConflictException);
  role = 'viewer';
  await expect(c.updateProperty(p.id, { address: 'Altro' }, 'Bearer t', org)).rejects.toBeInstanceOf(ForbiddenException);
  role = 'member';
 });
});
