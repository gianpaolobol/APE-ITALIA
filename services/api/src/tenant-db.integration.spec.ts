import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CasesController } from './cases.controller';
import type { AuthService } from './auth.service';
import { CURRENT_NOTICES } from './evidence/consent-policy';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL tenant isolation integration',()=>{
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const a=randomUUID(), b=randomUUID(), propertyA=randomUUID(), propertyB=randomUUID();
 const subject='integration-test-subject';
 const auth={authorize:async (_token?:string,organizationId?:string)=>{
  if(organizationId!==a && organizationId!==b) throw Error('Unknown tenant');
  return {organizationId,actorId:subject,role:'member'};
 }} as AuthService;
 const controller=new CasesController(db as any,auth);
 beforeAll(async()=>{
  await db.$connect();
  await db.organization.createMany({data:[{id:a,name:'Test tenant A'},{id:b,name:'Test tenant B'}]});
  await db.property.createMany({data:[
   {id:propertyA,organizationId:a,address:'Test A',city:'Bologna',region:'Emilia-Romagna'},
   {id:propertyB,organizationId:b,address:'Test B',city:'Bologna',region:'Emilia-Romagna'}
  ]});
 });
 afterAll(async()=>{
  await db.auditEvent.deleteMany({where:{organizationId:{in:[a,b]}}});
  await db.apeCase.deleteMany({where:{organizationId:{in:[a,b]}}});
  await db.property.deleteMany({where:{organizationId:{in:[a,b]}}});
  await db.organization.deleteMany({where:{id:{in:[a,b]}}});
  await db.$disconnect();
 });
 it('tenant A cannot list tenant B property',async()=>{
  const result=await controller.listProperties('Bearer test',a);
  expect(result.map(p=>p.id)).toContain(propertyA);
  expect(result.map(p=>p.id)).not.toContain(propertyB);
 });
 it('tenant A cannot create case for tenant B property',async()=>{
  await expect(controller.createCase({propertyId:propertyB},'Bearer test',a)).rejects.toThrow('Property not found');
 });
 it('tenant A can create case for own property and audit it',async()=>{
  const item=await controller.createCase({propertyId:propertyA},'Bearer test',a);
  expect(item.organizationId).toBe(a);
  const audit=await db.auditEvent.findFirst({where:{organizationId:a,resourceId:item.id,action:'case.create'}});
  expect(audit?.actorId).toBe(subject);
 });
});

describe.skipIf(!enabled)('PostgreSQL case submission', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const org = randomUUID(), other = randomUUID(), property = randomUUID();
 const auth = { authorize: async (_t?: string, o?: string) => ({ organizationId: o!, actorId: 'submit-test-subject', role: 'member' }) } as AuthService;
 const controller = new CasesController(db as any, auth);
 beforeAll(async () => {
  await db.organization.createMany({ data: [{ id: org, name: 'Submit tenant' }, { id: other, name: 'Other tenant' }] });
  await db.property.create({ data: { id: property, organizationId: org, address: 'Test S', city: 'Bologna', region: 'Emilia-Romagna' } });
 });
 afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await db.consent.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await db.apeCase.deleteMany({ where: { organizationId: { in: [org, other] } } });
  await db.property.deleteMany({ where: { organizationId: org } });
  await db.organization.deleteMany({ where: { id: { in: [org, other] } } });
  await db.$disconnect();
 });
 it('submits a draft once, refuses resubmission and foreign tenants', async () => {
  const c = await controller.createCase({ propertyId: property }, 'Bearer test', org);
  await expect(controller.submitCase(c.id, 'Bearer test', other)).rejects.toThrow('Case not found');
  await expect(controller.submitCase(c.id, 'Bearer test', org)).rejects.toThrow('Consent to the current');
  const consent = { organizationId: org, caseId: c.id, kind: 'evidence_processing' };
  await db.consent.createMany({ data: [
   { ...consent, subject: 'different-member', version: CURRENT_NOTICES.evidence_processing },
   { ...consent, subject: 'submit-test-subject', version: 'outdated-test-version' },
  ] });
  await expect(controller.submitCase(c.id, 'Bearer test', org)).rejects.toThrow('Consent to the current');
  expect((await db.apeCase.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('DRAFT');
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'case.submit', resourceId: c.id } })).toBe(0);
  await db.consent.create({ data: { ...consent, subject: 'submit-test-subject', version: CURRENT_NOTICES.evidence_processing } });
  expect((await controller.submitCase(c.id, 'Bearer test', org)).status).toBe('SUBMITTED');
  await expect(controller.submitCase(c.id, 'Bearer test', org)).rejects.toThrow('Only draft cases');
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'case.submit', resourceId: c.id } })).toBe(1);
 });
});
