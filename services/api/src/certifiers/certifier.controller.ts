import {
 Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, Inject, NotFoundException, Optional, Param, ParseUUIDPipe, Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { EVIDENCE_STORAGE } from '../evidence/evidence.controller';
import { EVIDENCE_PUBLIC_FIELDS, evidenceFile } from '../evidence/read';
import type { ObjectStorage } from '../evidence/storage';
import { offerNext } from './assignment.service';

/**
 * Certifier workspace. Access is per accepted assignment: before acceptance a certifier sees only the
 * municipality and region (data minimization); after acceptance, the address and the evidence.
 */
@Controller('v1/certifier')
export class CertifierController {
 constructor(
  @Inject(PrismaService) private readonly db: PrismaService,
  @Inject(AuthService) private readonly auth: AuthService,
  @Optional() @Inject(EVIDENCE_STORAGE) private readonly storage: ObjectStorage | null = null,
 ) {}

 private async certifier(token?: string) {
  const { subject } = await this.auth.verify(token);
  const c = await this.db.certifier.findUnique({ where: { userSubject: subject } });
  if (!c || !c.active || !c.verifiedAt) throw new ForbiddenException('Verified certifier profile required');
  return c;
 }

 private async accepted(token: string | undefined, assignmentId: string) {
  const c = await this.certifier(token);
  const a = await this.db.assignment.findFirst({ where: { id: assignmentId, certifierId: c.id, status: 'ACCEPTED' } });
  if (!a) throw new NotFoundException('Assignment not found');
  return { c, a };
 }

 @Get('me')
 async me(@Headers('authorization') token?: string) {
  const c = await this.certifier(token);
  return { id: c.id, displayName: c.displayName, registrationId: c.registrationId, regions: c.regions, maxActiveAssignments: c.maxActiveAssignments };
 }

 @Get('assignments')
 async list(@Headers('authorization') token?: string) {
  const c = await this.certifier(token);
  const now = new Date();
  const rows = await this.db.assignment.findMany({
   where: { certifierId: c.id, OR: [{ status: 'ACCEPTED' }, { status: 'OFFERED', expiresAt: { gt: now } }] },
   include: { case: { include: { property: true } } },
   orderBy: { offeredAt: 'desc' },
  });
  return rows.map(a => ({
   id: a.id,
   status: a.status,
   offeredAt: a.offeredAt,
   expiresAt: a.expiresAt,
   caseId: a.caseId,
   caseStatus: a.case.status,
   property: a.status === 'ACCEPTED'
    ? { address: a.case.property.address, city: a.case.property.city, region: a.case.property.region, floorAreaM2: a.case.property.floorAreaM2 }
    : { city: a.case.property.city, region: a.case.property.region },
  }));
 }

 @Post('assignments/:id/accept')
 async accept(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string) {
  const c = await this.certifier(token);
  const now = new Date();
  return this.db.$transaction(async tx => {
   const res = await tx.assignment.updateMany({ where: { id, certifierId: c.id, status: 'OFFERED', expiresAt: { gt: now } }, data: { status: 'ACCEPTED', respondedAt: now } });
   if (res.count !== 1) throw new NotFoundException('Offer not found or expired');
   const a = await tx.assignment.findUniqueOrThrow({ where: { id } });
   const moved = await tx.apeCase.updateMany({ where: { id: a.caseId, status: 'SUBMITTED' }, data: { status: 'ASSIGNED' } });
   if (moved.count !== 1) throw new ConflictException('Case is no longer awaiting a certifier');
   await tx.assignment.updateMany({ where: { caseId: a.caseId, status: 'OFFERED', id: { not: id } }, data: { status: 'WITHDRAWN', respondedAt: now } });
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'assignment.accept', resourceId: id } });
   return { id, status: 'ACCEPTED', caseId: a.caseId };
  });
 }

 @Post('assignments/:id/decline')
 async decline(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: { reason?: unknown } | undefined, @Headers('authorization') token?: string) {
  const c = await this.certifier(token);
  const reason = typeof body?.reason === 'string' ? body.reason.slice(0, 500) : null;
  const now = new Date();
  return this.db.$transaction(async tx => {
   const res = await tx.assignment.updateMany({ where: { id, certifierId: c.id, status: 'OFFERED' }, data: { status: 'DECLINED', respondedAt: now, declineReason: reason } });
   if (res.count !== 1) throw new NotFoundException('Offer not found');
   const a = await tx.assignment.findUniqueOrThrow({ where: { id } });
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'assignment.decline', resourceId: id } });
   const nextId = await offerNext(tx, a.caseId, now); // fallback to the next eligible certifier
   return { id, status: 'DECLINED', reoffered: nextId !== null };
  });
 }

 @Get('assignments/:id/evidence')
 async evidence(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string) {
  const { a } = await this.accepted(token, id);
  return this.db.evidence.findMany({ where: { caseId: a.caseId, organizationId: a.organizationId }, select: EVIDENCE_PUBLIC_FIELDS, orderBy: { createdAt: 'asc' } });
 }

 @Get('assignments/:id/evidence/:evidenceId/content')
 @Header('Cache-Control', 'no-store')
 @Header('X-Content-Type-Options', 'nosniff')
 async content(@Param('id', new ParseUUIDPipe()) id: string, @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string, @Headers('authorization') token?: string) {
  const { c, a } = await this.accepted(token, id);
  const ev = await this.db.evidence.findFirst({ where: { id: evidenceId, caseId: a.caseId, organizationId: a.organizationId } });
  if (!ev) throw new NotFoundException('Evidence not found');
  const file = await evidenceFile(this.storage, ev);
  await this.db.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'evidence.read', resourceId: ev.id } });
  return file;
 }
}
