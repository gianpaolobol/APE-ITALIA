import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CasesController } from './cases.controller';
import type { AuthService } from './auth.service';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL tenant isolation integration',()=>{
 const db = new PrismaClient();
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
