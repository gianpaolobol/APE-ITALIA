import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CasesController } from './cases.controller';
import type { PrismaService } from './prisma.service';
import type { AuthService } from './auth.service';

function setup(tenant='org-a', role='member') {
 const authorize=vi.fn().mockResolvedValue({organizationId:tenant,actorId:'user-a',role});
 const propertyFindMany=vi.fn().mockResolvedValue([]);
 const caseFindMany=vi.fn().mockResolvedValue([]);
 const propertyFindFirst=vi.fn().mockResolvedValue(null);
 const db={
  property:{findMany:propertyFindMany,findFirst:propertyFindFirst},
  apeCase:{findMany:caseFindMany},
 } as unknown as PrismaService;
 const controller=new CasesController(db,{authorize} as unknown as AuthService);
 return {controller,authorize,propertyFindMany,caseFindMany,propertyFindFirst};
}
describe('tenant-scoped API query contract',()=>{
 it('lists properties only in the verified tenant',async()=>{
  const {controller,propertyFindMany}=setup();
  await controller.listProperties('Bearer token','org-b');
  expect(propertyFindMany).toHaveBeenCalledWith({where:{organizationId:'org-a'},orderBy:{createdAt:'desc'}});
 });
 it('lists cases only in the verified tenant',async()=>{
  const {controller,caseFindMany}=setup();
  await controller.listCases('Bearer token','org-b');
  expect(caseFindMany).toHaveBeenCalledWith({where:{organizationId:'org-a'},orderBy:{createdAt:'desc'}});
 });
 it('rejects writes from read-only members',async()=>{
  const {controller}=setup('org-a','viewer');
  await expect(controller.createProperty({address:'A',city:'B',region:'C'},'Bearer token','org-a')).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('does not create a case for a property outside the tenant',async()=>{
  const {controller,propertyFindFirst}=setup();
  const tx={property:{findFirst:propertyFindFirst}};
  (controller as any).db.$transaction=vi.fn(async(fn:any)=>fn(tx));
  await expect(controller.createCase({propertyId:'123e4567-e89b-42d3-a456-426614174000'},'Bearer token','org-a')).rejects.toBeInstanceOf(NotFoundException);
  expect(propertyFindFirst).toHaveBeenCalledWith({where:{id:'123e4567-e89b-42d3-a456-426614174000',organizationId:'org-a'}});
 });
});
