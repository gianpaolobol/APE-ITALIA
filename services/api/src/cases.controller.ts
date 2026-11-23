import { Body, Controller, Get, Headers, Param, Post, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { IsNotEmpty, IsString, IsUUID, validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';

class CreateCaseDto {
 @IsUUID() propertyId!: string;
}
class CreatePropertyDto {
 @IsString() @IsNotEmpty() address!: string;
 @IsString() @IsNotEmpty() city!: string;
 @IsString() @IsNotEmpty() region!: string;
}
function validated<T extends object>(cls: new()=>T, body: unknown): T {
 const dto=plainToInstance(cls,body);
 const errors=validateSync(dto,{whitelist:true,forbidNonWhitelisted:true});
 if(errors.length) throw new BadRequestException(errors);
 return dto;
}
@Controller('v1')
export class CasesController {
 constructor(private readonly db:PrismaService){}
 // DEVELOPMENT ONLY: no tenant ID is accepted from a caller until authentication is implemented.
 // Intentionally disable endpoints to prevent impersonation or cross-tenant data access.
 @Get('properties')
 listProperties(){throw new ForbiddenException('Authentication required: endpoint not enabled');}
 @Post('properties')
 createProperty(@Body() body:unknown){validated(CreatePropertyDto,body);throw new ForbiddenException('Authentication required: endpoint not enabled');}
 @Get('cases')
 listCases(){throw new ForbiddenException('Authentication required: endpoint not enabled');}
 @Post('cases')
 createCase(@Body() body:unknown){validated(CreateCaseDto,body);throw new ForbiddenException('Authentication required: endpoint not enabled');}
}
