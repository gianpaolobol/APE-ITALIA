import {
 BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Headers, HttpException, HttpStatus, Inject, NotFoundException,
 Optional, Param, ParseUUIDPipe, Post, ServiceUnavailableException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { EVIDENCE_STORAGE } from '../evidence/evidence.controller';
import type { ObjectStorage } from '../evidence/storage';
import { validateFieldValue } from '../inspections/report';
import { EXTRACTION_PROVIDER, sanitizeCandidates, type ExtractionProvider } from './provider';

const REVIEW_ACTIONS = ['accept', 'correct', 'reject'] as const;

/**
 * AI-assisted extraction under professional supervision. Candidates are stored as "needs_review" with
 * provenance (evidence, model, confidence) and become usable only after a certifier decision.
 */
@Controller('v1/certifier/assignments/:assignmentId')
export class ExtractionController {
 constructor(
  @Inject(PrismaService) private readonly db: PrismaService,
  @Inject(AuthService) private readonly auth: AuthService,
  @Optional() @Inject(EVIDENCE_STORAGE) private readonly storage: ObjectStorage | null = null,
  @Optional() @Inject(EXTRACTION_PROVIDER) private readonly provider: ExtractionProvider | null = null,
 ) {}

 private async accepted(token: string | undefined, assignmentId: string) {
  const { subject } = await this.auth.verify(token);
  const c = await this.db.certifier.findUnique({ where: { userSubject: subject } });
  if (!c || !c.active || !c.verifiedAt) throw new ForbiddenException('Verified certifier profile required');
  const a = await this.db.assignment.findFirst({ where: { id: assignmentId, certifierId: c.id, status: 'ACCEPTED' } });
  if (!a) throw new NotFoundException('Assignment not found');
  return { actor: `certifier:${c.userSubject}`, a };
 }

 @Post('evidence/:evidenceId/extract')
 @Throttle({ default: { limit: 20, ttl: 60_000 } })
 async extract(@Param('assignmentId', new ParseUUIDPipe()) assignmentId: string, @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string, @Headers('authorization') token?: string) {
  const { actor, a } = await this.accepted(token, assignmentId);
  if (!this.provider) throw new ServiceUnavailableException('AI extraction not configured (requires DPA and authorization)');
  if (!this.storage) throw new ServiceUnavailableException('Evidence storage not configured');
  const ev = await this.db.evidence.findFirst({ where: { id: evidenceId, caseId: a.caseId, organizationId: a.organizationId } });
  if (!ev) throw new NotFoundException('Evidence not found');
  // Only malware-clean files may be sent to an external processor.
  if (ev.scanStatus !== 'clean') throw new HttpException('Evidence must be malware-scanned before extraction', HttpStatus.LOCKED);
  if (await this.db.extractedField.count({ where: { evidenceId, modelId: this.provider.modelId } })) throw new ConflictException('Already extracted with this model');
  const raw = await this.provider.extract({ kind: ev.kind, mimeType: ev.mimeType, data: await this.storage.get(ev.storageKey) });
  const { accepted, rejected } = sanitizeCandidates(raw);
  const modelId = this.provider.modelId;
  await this.db.$transaction(async tx => {
   for (const c of accepted) {
    const row = await tx.extractedField.create({ data: { organizationId: a.organizationId, caseId: a.caseId, evidenceId, field: c.field, value: c.value, unit: c.unit, confidence: c.confidence, modelId } });
    await tx.extractedFieldRevision.create({ data: { extractedFieldId: row.id, action: 'extracted', newValue: c.value, actor: `model:${modelId}` } });
   }
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: actor, action: 'ai.extract', resourceId: evidenceId } });
  });
  return { modelId, candidates: accepted.length, discarded: rejected };
 }

 @Get('extracted-fields')
 async list(@Param('assignmentId', new ParseUUIDPipe()) assignmentId: string, @Headers('authorization') token?: string) {
  const { a } = await this.accepted(token, assignmentId);
  return this.db.extractedField.findMany({
   where: { caseId: a.caseId, organizationId: a.organizationId },
   include: { revisions: { orderBy: { at: 'asc' }, select: { action: true, previousValue: true, newValue: true, actor: true, note: true, at: true } } },
   orderBy: [{ field: 'asc' }, { extractedAt: 'asc' }],
  });
 }

 @Post('extracted-fields/:fieldId/review')
 async review(@Param('assignmentId', new ParseUUIDPipe()) assignmentId: string, @Param('fieldId', new ParseUUIDPipe()) fieldId: string,
  @Body() body: { action?: unknown; value?: unknown; note?: unknown } | undefined, @Headers('authorization') token?: string) {
  const { actor, a } = await this.accepted(token, assignmentId);
  const action = body?.action;
  if (!(REVIEW_ACTIONS as readonly unknown[]).includes(action)) throw new BadRequestException('action must be accept, correct or reject');
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 1000) : undefined;
  return this.db.$transaction(async tx => {
   const f = await tx.extractedField.findFirst({ where: { id: fieldId, caseId: a.caseId, organizationId: a.organizationId } });
   if (!f) throw new NotFoundException('Extracted field not found');
   if (f.status !== 'needs_review') throw new ConflictException('Already reviewed');
   let newValue: Prisma.InputJsonValue = f.value as Prisma.InputJsonValue;
   if (action === 'correct') {
    const err = validateFieldValue(f.field, body?.value);
    if (err) throw new BadRequestException(err);
    if (body!.value === f.value) throw new BadRequestException('Correction equals the extracted value: use accept');
    newValue = body!.value as string | number;
   }
   if (action === 'reject' && (!note || note.length < 3)) throw new BadRequestException('Explain why the value is rejected');
   const status = action === 'accept' ? 'accepted' : action === 'correct' ? 'corrected' : 'rejected';
   const now = new Date();
   const res = await tx.extractedField.updateMany({ where: { id: f.id, status: 'needs_review' }, data: { status, value: newValue, reviewedBy: actor, reviewedAt: now } });
   if (res.count !== 1) throw new ConflictException('Already reviewed');
   await tx.extractedFieldRevision.create({ data: { extractedFieldId: f.id, action: status, previousValue: f.value as Prisma.InputJsonValue, newValue: action === 'reject' ? Prisma.JsonNull : newValue, actor, ...(note ? { note } : {}) } });
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: actor, action: 'ai.review', resourceId: f.id } });
   return { id: f.id, field: f.field, status, value: action === 'reject' ? null : newValue };
  });
 }
}
