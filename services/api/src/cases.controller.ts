import { Body, Controller, Get, Headers, Param, Post, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { AuthService } from './auth.service';
import { IsNotEmpty, IsString, IsUUID, IsOptional, IsNumber, Min, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class CreateCaseDto { @IsUUID() propertyId!: string; }
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
 constructor(private readonly db:PrismaService,private readonly auth:AuthService){}
 private session(auth?:string,org?:string){return this.auth.authorize(auth,org);}
 @Get('properties')
 async listProperties(@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
  return this.db.property.findMany({where:{organizationId:s.organizationId},orderBy:{createdAt:'desc'}});
 }
 @Post('properties')
 async createProperty(@Body() body:unknown,@Headers('authorization') token?:string,@Headers('x-organization-id') org?:string){
  const s=await this.session(token,org);
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
  const dto=validated(CreateCaseDto,body);
  return this.db.$transaction(async tx=>{
   const property=await tx.property.findFirst({where:{id:dto.propertyId,organizationId:s.organizationId}});
   if(!property) throw new NotFoundException('Property not found');
   const item=await tx.apeCase.create({data:{propertyId:property.id,organizationId:s.organizationId}});
   await tx.auditEvent.create({data:{organizationId:s.organizationId,actorId:s.actorId,action:'case.create',resourceId:item.id}});
   return item;
  });
 }
}
