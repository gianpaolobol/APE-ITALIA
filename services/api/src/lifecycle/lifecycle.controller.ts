import {
 BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, Inject, NotFoundException, Param, ParseUUIDPipe, Post,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { canWrite } from '../tenant-policy';
import { EVIDENCE_KINDS } from '../evidence/file-policy';
import { offerNext } from '../certifiers/assignment.service';

const CANCELLABLE = ['DRAFT', 'SUBMITTED', 'ASSIGNED', 'INSPECTION_SCHEDULED', 'AWAITING_EVIDENCE'] as const;
const REQUESTABLE = ['ASSIGNED', 'INSPECTION_SCHEDULED'] as const;
const WITHDRAWABLE = ['ASSIGNED', 'INSPECTION_SCHEDULED', 'AWAITING_EVIDENCE'] as const;
const reasonOf = (v: unknown, min = 3) => (typeof v === 'string' && v.trim().length >= min ? v.trim().slice(0, 1000) : null);

/**
 * Case lifecycle beyond the happy path: evidence requests, customer cancellation, certifier withdrawal
 * with automatic re-matching. All transitions are conditional updates (no lost updates) and audited.
 */
@Controller('v1')
export class LifecycleController {
 constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuthService) private readonly auth: AuthService) {}

 private async certifierAssignment(token: string | undefined, id: string) {
  const { subject } = await this.auth.verify(token);
  const c = await this.db.certifier.findUnique({ where: { userSubject: subject } });
  if (!c || !c.active || !c.verifiedAt) throw new ForbiddenException('Verified certifier profile required');
  const a = await this.db.assignment.findFirst({ where: { id, certifierId: c.id, status: 'ACCEPTED' } });
  if (!a) throw new NotFoundException('Assignment not found');
  return { actor: `certifier:${c.userSubject}`, a };
 }

 /** Certifier asks the customer for more documents; the case pauses in AWAITING_EVIDENCE. */
 @Post('certifier/assignments/:id/evidence-requests')
 async requestEvidence(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: { message?: unknown; kinds?: unknown } | undefined, @Headers('authorization') token?: string) {
  const { actor, a } = await this.certifierAssignment(token, id);
  const message = reasonOf(body?.message, 10);
  if (!message) throw new BadRequestException('Describe what is needed (at least 10 characters)');
  const kinds = Array.isArray(body?.kinds) ? [...new Set(body!.kinds)] : [];
  if (!kinds.length || !kinds.every(k => (EVIDENCE_KINDS as readonly unknown[]).includes(k))) throw new BadRequestException('kinds must list evidence kinds');
  return this.db.$transaction(async tx => {
   const c = await tx.apeCase.findUniqueOrThrow({ where: { id: a.caseId } });
   if (!(REQUESTABLE as readonly string[]).includes(c.status)) throw new ConflictException('Evidence can be requested only before the inspection report');
   const moved = await tx.apeCase.updateMany({ where: { id: c.id, status: c.status }, data: { status: 'AWAITING_EVIDENCE' } });
   if (moved.count !== 1) throw new ConflictException('Case state changed');
   const r = await tx.evidenceRequest.create({ data: { caseId: c.id, organizationId: a.organizationId, assignmentId: a.id, message, kinds: kinds as string[], previousStatus: c.status, createdBy: actor } });
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: actor, action: 'evidence_request.create', resourceId: r.id } });
   return r;
  });
 }

 @Get('cases/:id/evidence-requests')
 async listRequests(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  return this.db.evidenceRequest.findMany({ where: { caseId: id, organizationId: s.organizationId }, select: { id: true, message: true, kinds: true, createdAt: true, resolvedAt: true }, orderBy: { createdAt: 'desc' } });
 }

 /** Customer confirms the requested files were uploaded; the case resumes its previous state. */
 @Post('cases/:id/evidence-requests/:requestId/resolve')
 async resolve(@Param('id', new ParseUUIDPipe()) id: string, @Param('requestId', new ParseUUIDPipe()) requestId: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  if (!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  return this.db.$transaction(async tx => {
   const r = await tx.evidenceRequest.findFirst({ where: { id: requestId, caseId: id, organizationId: s.organizationId } });
   if (!r) throw new NotFoundException('Request not found');
   const done = await tx.evidenceRequest.updateMany({ where: { id: r.id, resolvedAt: null }, data: { resolvedAt: new Date(), resolvedBy: s.actorId } });
   if (done.count !== 1) throw new ConflictException('Request already resolved');
   const newer = await tx.evidenceRequest.count({ where: { caseId: id, resolvedAt: null } });
   if (newer === 0) await tx.apeCase.updateMany({ where: { id, status: 'AWAITING_EVIDENCE' }, data: { status: r.previousStatus } });
   await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'evidence_request.resolve', resourceId: r.id } });
   return (await tx.apeCase.findUniqueOrThrow({ where: { id }, select: { id: true, status: true } }));
  });
 }

 /** Customer cancellation before the inspection report; open offers are withdrawn, inspections cancelled. */
 @Post('cases/:id/cancel')
 async cancel(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: { reason?: unknown } | undefined, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  if (!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  const reason = reasonOf(body?.reason);
  if (!reason) throw new BadRequestException('A reason is required');
  return this.db.$transaction(async tx => {
   const moved = await tx.apeCase.updateMany({ where: { id, organizationId: s.organizationId, status: { in: [...CANCELLABLE] } }, data: { status: 'CANCELLED' } });
   if (moved.count !== 1) {
    if (!(await tx.apeCase.findFirst({ where: { id, organizationId: s.organizationId }, select: { id: true } }))) throw new NotFoundException('Case not found');
    throw new ConflictException('Case can no longer be cancelled');
   }
   const now = new Date();
   await tx.assignment.updateMany({ where: { caseId: id, status: { in: ['OFFERED', 'ACCEPTED'] } }, data: { status: 'WITHDRAWN', respondedAt: now, declineReason: 'cancelled by customer' } });
   await tx.inspection.updateMany({ where: { caseId: id, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
   await tx.evidenceRequest.updateMany({ where: { caseId: id, resolvedAt: null }, data: { resolvedAt: now, resolvedBy: s.actorId } });
   await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'case.cancel', resourceId: id } });
   return { id, status: 'CANCELLED' };
  });
 }

 /** Certifier gives up an accepted assignment before the report; the case returns to matching. */
 @Post('certifier/assignments/:id/withdraw')
 async withdraw(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: { reason?: unknown } | undefined, @Headers('authorization') token?: string) {
  const { actor, a } = await this.certifierAssignment(token, id);
  const reason = reasonOf(body?.reason);
  if (!reason) throw new BadRequestException('A reason is required');
  return this.db.$transaction(async tx => {
   const moved = await tx.apeCase.updateMany({ where: { id: a.caseId, status: { in: [...WITHDRAWABLE] } }, data: { status: 'SUBMITTED' } });
   if (moved.count !== 1) throw new ConflictException('Withdrawal is possible only before the inspection report');
   const now = new Date();
   await tx.assignment.update({ where: { id: a.id }, data: { status: 'WITHDRAWN', respondedAt: now, declineReason: reason } });
   await tx.inspection.updateMany({ where: { assignmentId: a.id, status: 'SCHEDULED' }, data: { status: 'CANCELLED' } });
   await tx.evidenceRequest.updateMany({ where: { caseId: a.caseId, resolvedAt: null }, data: { resolvedAt: now, resolvedBy: actor } });
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: actor, action: 'assignment.withdraw', resourceId: a.id } });
   const next = await offerNext(tx, a.caseId, now);
   return { id: a.id, status: 'WITHDRAWN', reoffered: next !== null };
  });
 }
}
