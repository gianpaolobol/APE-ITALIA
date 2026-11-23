import { Body, Controller, Delete, HttpCode, Inject, Get, Headers, Param, ParseUUIDPipe, Patch, Post, ConflictException, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth.service';
import { canWrite } from './tenant-policy';
import { offerNext } from './certifiers/assignment.service';
import { IsNotEmpty, IsString, IsUUID, IsOptional, IsNumber, Min, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class CreateCaseDto { @IsUUID() propertyId!: string; }
class UpdatePropertyDto {
 @IsOptional() @IsString() @IsNotEmpty() address?: string;
 @IsOptional() @IsString() @IsNotEmpty() city?: string;
 @IsOptional() @IsString() @IsNotEmpty() region?: string;
 @IsOptional() @IsNumber() @Min(1) floorAreaM2?: number;
}
class CreatePropertyDto {
 @IsString() @IsNotEmpty() address!: string;
 @IsString() @IsNotEmpty() city!: string;
 @IsString() @IsNotEmpty() region!: string;
 @IsOptional() @IsNumber() @Min(1) floorAreaM2?: number;
}
function validated<T extends object>(cls: new()=>T, body: unknown): T {
 const dto=plainToInstance(cls,body);
 const errors=validateSync(dto,{whitelist:true,forbidNonWhitelisted:true});
 if(errors.length) throw new BadRequestException(errors);
 return dto;
}
@Controller('v1')
export class CasesController {
 constructor(@Inject(PrismaService) private readonly db:PrismaService,@Inject(AuthService) private readonly auth:AuthService){}
 private session(auth?:string,org?:string){return this.auth.authorize(auth,org);}
 @Get('properties')
 async listProperties(@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  return this.db.property.findMany({where:{organizationId:s.organizationId},orderBy:{createdAt:'desc'}});
 }
 @Post('properties')
 async createProperty(@Body() body:unknown,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  if(!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  const dto=validated(CreatePropertyDto,body);
  return this.db.$transaction(async tx=>{
   const item=await tx.property.create({data:{...dto,organizationId:s.organizationId}});
   await tx.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'property.create',resourceId:item.id}});
   return item;
  });
 }
 @Get('cases')
 async listCases(@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  return this.db.apeCase.findMany({where:{organizationId:s.organizationId},orderBy:{createdAt:'desc'}});
 }
 @Post('cases')
 async createCase(@Body() body:unknown,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  if(!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  const dto=validated(CreateCaseDto,body);
  return this.db.$transaction(async tx=>{
   const property=await tx.property.findFirst({where:{id:dto.propertyId,organizationId:s.organizationId}});
   if(!property) throw new NotFoundException('Property not found');
   const item=await tx.apeCase.create({data:{propertyId:property.id,organizationId:s.organizationId}});
   await tx.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'case.create',resourceId:item.id}});
   return item;
  });
 }
 /** Customer submission: DRAFT -> SUBMITTED only. Later transitions belong to certifier workflows. */
 @Post('cases/:id/submit')
 async submitCase(@Param('id', new ParseUUIDPipe()) id:string,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  if(!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  return this.db.$transaction(async tx=>{
   const res=await tx.apeCase.updateMany({where:{id,organizationId:s.organizationId,status:'DRAFT'},data:{status:'SUBMITTED'}});
   if(res.count!==1){
    const exists=await tx.apeCase.findFirst({where:{id,organizationId:s.organizationId},select:{id:true}});
    if(!exists) throw new NotFoundException('Case not found');
    throw new ConflictException('Only draft cases can be submitted');
   }
   await tx.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'case.submit',resourceId:id}});
   await offerNext(tx,id); // automatic matching; null leaves the case SUBMITTED for manual follow-up
   return tx.apeCase.findFirstOrThrow({where:{id,organizationId:s.organizationId}});
  });
 }
 /** Guided-survey answers, indicative estimate and quote from the mobile app (editable only while DRAFT). */
 @Post('cases/:id/survey')
 @HttpCode(200)
 async saveSurvey(@Param('id', new ParseUUIDPipe()) id:string,@Body() body:unknown,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  if(!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  if(!body||typeof body!=='object'||Array.isArray(body)) throw new BadRequestException('survey object required');
  const json=JSON.stringify(body);
  if(json.length>64_000) throw new BadRequestException('survey too large');
  const res=await this.db.apeCase.updateMany({where:{id,organizationId:s.organizationId,status:'DRAFT'},data:{survey:JSON.parse(json)}});
  if(res.count!==1){
   const exists=await this.db.apeCase.findFirst({where:{id,organizationId:s.organizationId},select:{id:true}});
   if(!exists) throw new NotFoundException('Case not found');
   throw new ConflictException('Survey can be changed only before submission');
  }
  await this.db.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'case.survey',resourceId:id}});
  return {id};
 }
 /** Customer view: date, status and certifier name only; the technical report stays with the certifier. */
 @Get('cases/:id/inspection')
 async caseInspection(@Param('id', new ParseUUIDPipe()) id:string,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  const c=await this.db.apeCase.findFirst({where:{id,organizationId:s.organizationId},select:{id:true,status:true}});
  if(!c) throw new NotFoundException('Case not found');
  const insp=await this.db.inspection.findFirst({where:{caseId:id,organizationId:s.organizationId,status:{not:'CANCELLED'}},include:{assignment:{include:{certifier:{select:{displayName:true}}}}},orderBy:{createdAt:'desc'}});
  return {caseStatus:c.status,inspection:insp?{status:insp.status,scheduledAt:insp.scheduledAt,performedAt:insp.performedAt,certifierName:insp.assignment.certifier.displayName}:null};
 }
 /** One query for the customer's case list: property, live status, inspection date and certificate presence. */
 @Get('case-summaries')
 async caseSummaries(@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  const rows=await this.db.apeCase.findMany({
   where:{organizationId:s.organizationId},orderBy:{createdAt:'desc'},take:100,
   include:{
    property:{select:{address:true,city:true,region:true}},
    inspections:{where:{status:{not:'CANCELLED'}},orderBy:{createdAt:'desc'},take:1,include:{assignment:{include:{certifier:{select:{displayName:true}}}}}},
    certificate:{select:{regionalId:true,depositedAt:true,deliveredAt:true}},
    _count:{select:{evidenceRequests:{where:{resolvedAt:null}}}},
   },
  });
  return rows.map(c=>({
   id:c.id,status:c.status,createdAt:c.createdAt,property:c.property,
   inspection:c.inspections[0]?{status:c.inspections[0].status,scheduledAt:c.inspections[0].scheduledAt,performedAt:c.inspections[0].performedAt,certifierName:c.inspections[0].assignment.certifier.displayName}:null,
   certificate:c.certificate,
   openEvidenceRequests:c._count.evidenceRequests,
  }));
 }
 @Get('properties/:id')
 async getProperty(@Param('id', new ParseUUIDPipe()) id:string,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  const p=await this.db.property.findFirst({where:{id,organizationId:s.organizationId}});
  if(!p) throw new NotFoundException('Property not found');
  return p;
 }

 /** Declared data can change only while no case on the property has been submitted to a certifier. */
 @Patch('properties/:id')
 async updateProperty(@Param('id', new ParseUUIDPipe()) id:string,@Body() body:unknown,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  if(!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  // With ES2022 class fields, optional DTO properties exist as `undefined`: keep only provided values.
  const data=Object.fromEntries(Object.entries(validated(UpdatePropertyDto,body)).filter(([,v])=>v!==undefined));
  if(!Object.keys(data).length) throw new BadRequestException('Nothing to update');
  return this.db.$transaction(async tx=>{
   const p=await tx.property.findFirst({where:{id,organizationId:s.organizationId}});
   if(!p) throw new NotFoundException('Property not found');
   const locked=await tx.apeCase.count({where:{propertyId:id,status:{notIn:['DRAFT','CANCELLED']}}});
   if(locked) throw new ConflictException('Property data is locked once a case has been submitted');
   const updated=await tx.property.update({where:{id},data});
   await tx.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'property.update',resourceId:id}});
   return updated;
  });
 }

 @Get('cases/:id')
 async getCase(@Param('id', new ParseUUIDPipe()) id:string,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  const c=await this.db.apeCase.findFirst({where:{id,organizationId:s.organizationId},include:{property:true}});
  if(!c) throw new NotFoundException('Case not found');
  return c;
 }

 /** Deletes a draft without uploads or consents; anything else must be cancelled (kept for the audit trail). */
 @Delete('cases/:id')
 @HttpCode(204)
 async deleteCase(@Param('id', new ParseUUIDPipe()) id:string,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  if(!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  await this.db.$transaction(async tx=>{
   const c=await tx.apeCase.findFirst({where:{id,organizationId:s.organizationId},include:{_count:{select:{evidence:true,consents:true,assignments:true}}}});
   if(!c) throw new NotFoundException('Case not found');
   if(c.status!=='DRAFT'||c._count.evidence||c._count.consents||c._count.assignments) throw new ConflictException('Only empty drafts can be deleted; cancel the case instead');
   const res=await tx.apeCase.deleteMany({where:{id,status:'DRAFT'}});
   if(res.count!==1) throw new ConflictException('Case state changed');
   await tx.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'case.delete',resourceId:id}});
  });
 }

 /** A property can be removed only when it has no cases left. */
 @Delete('properties/:id')
 @HttpCode(204)
 async deleteProperty(@Param('id', new ParseUUIDPipe()) id:string,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  if(!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  await this.db.$transaction(async tx=>{
   const p=await tx.property.findFirst({where:{id,organizationId:s.organizationId},include:{_count:{select:{cases:true}}}});
   if(!p) throw new NotFoundException('Property not found');
   if(p._count.cases) throw new ConflictException('Property still has cases');
   await tx.property.delete({where:{id}});
   await tx.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'property.delete',resourceId:id}});
  });
 }
}
