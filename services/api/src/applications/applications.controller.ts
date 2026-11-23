import { BadRequestException, Body, ConflictException, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { validateApplication } from './validation';

/** Public endpoint: certifiers apply; nothing is activated until an operator verifies the SACE number. */
@Controller('v1/certifier-applications')
export class ApplicationsController {
 constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

 @Post()
 @HttpCode(201)
 @Throttle({ default: { limit: 5, ttl: 60_000 } })
 async apply(@Body() body: unknown) {
  const v = validateApplication(body);
  if (!v.ok) throw new BadRequestException(v.errors);
  try {
   const row = await this.db.certifierApplication.create({ data: v.value, select: { id: true, status: true, createdAt: true } });
   return row;
  } catch (e) {
   if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('An application with this email or SACE number already exists');
   throw e;
  }
 }
}
