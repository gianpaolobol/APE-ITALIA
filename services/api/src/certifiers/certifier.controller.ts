import {
 BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, Inject, NotFoundException, Optional, Param, ParseUUIDPipe, Post, Query, ServiceUnavailableException, StreamableFile,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { EVIDENCE_STORAGE } from '../evidence/evidence.controller';
import { EVIDENCE_PUBLIC_FIELDS, evidenceFile } from '../evidence/read';
import type { ObjectStorage } from '../evidence/storage';
import { offerNext } from './assignment.service';
import { VIDEO_ANALYZER, type VideoAnalyzer } from '../survey/video-analysis';
import { buildCaseExport, findingsCsv } from '../export/case-export';
import type { InspectionReport } from '../inspections/report';
import { FINDING_FIELDS, FINDING_SOURCES, VERIFICATION_STATUSES, validateReport, validateSchedule } from '../inspections/report';

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
  @Optional() @Inject(VIDEO_ANALYZER) private readonly videoAnalyzer: VideoAnalyzer | null = null,
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
 /** AI pre-survey of a walkthrough video, cached on the evidence. Draft only: to be confirmed on site. */
 @Post('assignments/:id/evidence/:evidenceId/analyze-video')
 async analyzeVideo(@Param('id', new ParseUUIDPipe()) id: string, @Param('evidenceId', new ParseUUIDPipe()) evidenceId: string, @Headers('authorization') token?: string) {
  const { c, a } = await this.accepted(token, id);
  const ev = await this.db.evidence.findFirst({ where: { id: evidenceId, caseId: a.caseId, organizationId: a.organizationId, kind: 'video' } });
  if (!ev) throw new NotFoundException('Video not found');
  if (ev.analysis) return ev.analysis;
  if (!this.videoAnalyzer || !this.storage) throw new ServiceUnavailableException('Video analysis not enabled');
  if (ev.scanStatus !== 'clean') throw new ConflictException('Video must be malware-scanned first');
  const analysis = await this.videoAnalyzer.analyze(await this.storage.get(ev.storageKey));
  await this.db.evidence.update({ where: { id: ev.id }, data: { analysis: analysis as unknown as object } });
  await this.db.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'ai.video', resourceId: ev.id } });
  return analysis;
 }

 /** Schedules the optional pre-inspection video call (Jitsi room with an unguessable name). */
 @Post('assignments/:id/call')
 async scheduleCall(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: { at?: unknown } | undefined, @Headers('authorization') token?: string) {
  const { c, a } = await this.accepted(token, id);
  const at = typeof body?.at === 'string' ? new Date(body.at) : new Date(NaN);
  if (Number.isNaN(at.getTime()) || at.getTime() < Date.now() - 3600_000 || at.getTime() > Date.now() + 90 * 86400_000) throw new BadRequestException('at must be an ISO date within 90 days');
  const url = a.callUrl ?? `https://meet.jit.si/APEItalia-${randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9]/g, '')}`;
  await this.db.assignment.update({ where: { id: a.id }, data: { callAt: at, callUrl: url } });
  await this.db.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'assignment.call', resourceId: a.id } });
  return { at: at.toISOString(), url };
 }

 /** Customer survey (contacts, answers, photos checklist, indicative estimate): visible only after acceptance. */
 @Get('assignments/:id/survey')
 async survey(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string) {
  const { a } = await this.accepted(token, id);
  const row = await this.db.apeCase.findFirst({ where: { id: a.caseId, organizationId: a.organizationId }, select: { survey: true } });
  return { caseId: a.caseId, survey: row?.survey ?? null, note: 'Stima indicativa generata dall’app: non è un APE e va verificata con il sopralluogo.' };
 }

 @Get('inspection-schema')
 async inspectionSchema(@Headers('authorization') token?: string) {
  await this.certifier(token);
  return { fields: FINDING_FIELDS, statuses: VERIFICATION_STATUSES, sources: FINDING_SOURCES };
 }

 @Get('assignments/:id/inspection')
 async inspection(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string) {
  const { a } = await this.accepted(token, id);
  // Wrapped: a bare null would be sent by Nest as an empty body.
  return { inspection: (await this.db.inspection.findUnique({ where: { assignmentId: a.id } })) ?? null };
 }

 /** Schedules or reschedules the on-site inspection (only while not yet performed). */
 @Post('assignments/:id/inspection')
 async schedule(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: { scheduledAt?: unknown } | undefined, @Headers('authorization') token?: string) {
  const { c, a } = await this.accepted(token, id);
  const when = validateSchedule(body?.scheduledAt, new Date());
  if (typeof when === 'string') throw new BadRequestException(when);
  return this.db.$transaction(async tx => {
   const existing = await tx.inspection.findUnique({ where: { assignmentId: a.id } });
   if (existing && existing.status !== 'SCHEDULED') throw new ConflictException('Inspection already performed or cancelled');
   const insp = existing
    ? await tx.inspection.update({ where: { id: existing.id }, data: { scheduledAt: when } })
    : await tx.inspection.create({ data: { caseId: a.caseId, assignmentId: a.id, organizationId: a.organizationId, scheduledAt: when } });
   if (!existing) {
    const moved = await tx.apeCase.updateMany({ where: { id: a.caseId, status: 'ASSIGNED' }, data: { status: 'INSPECTION_SCHEDULED' } });
    if (moved.count !== 1) throw new ConflictException('Case is not in ASSIGNED state');
   }
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: existing ? 'inspection.reschedule' : 'inspection.schedule', resourceId: insp.id } });
   return insp;
  });
 }

 /** Submits the immutable structured report; values are only what the certifier recorded. */
 @Post('assignments/:id/inspection/report')
 async report(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: unknown, @Headers('authorization') token?: string) {
  const { c, a } = await this.accepted(token, id);
  return this.db.$transaction(async tx => {
   const insp = await tx.inspection.findUnique({ where: { assignmentId: a.id } });
   if (!insp) throw new ConflictException('Schedule the inspection first');
   if (insp.status !== 'SCHEDULED') throw new ConflictException('Report already submitted');
   const current = await tx.apeCase.findUniqueOrThrow({ where: { id: a.caseId }, select: { status: true } });
   if (current.status !== 'INSPECTION_SCHEDULED') throw new ConflictException('Case is not awaiting an inspection report (pending evidence request?)');
   const now = new Date();
   const res = validateReport(body, { scheduledAt: insp.scheduledAt, now });
   if (!res.ok) throw new BadRequestException(res.errors);
   const evidenceIds = [...new Set(res.report.findings.map(f => f.evidenceId).filter((x): x is string => !!x))];
   if (evidenceIds.length) {
    const found = await tx.evidence.count({ where: { id: { in: evidenceIds }, caseId: a.caseId, organizationId: a.organizationId } });
    if (found !== evidenceIds.length) throw new BadRequestException('Findings reference evidence outside this case');
   }
   const updated = await tx.inspection.updateMany({
    where: { id: insp.id, status: 'SCHEDULED' },
    data: { status: 'DONE', performedAt: new Date(res.report.performedAt), report: res.report, reportSubmittedAt: now },
   });
   if (updated.count !== 1) throw new ConflictException('Report already submitted');
   const moved = await tx.apeCase.updateMany({ where: { id: a.caseId, status: 'INSPECTION_SCHEDULED' }, data: { status: 'INSPECTION_DONE' } });
   if (moved.count !== 1) throw new ConflictException('Case is not awaiting an inspection');
   await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'inspection.report', resourceId: insp.id } });
   const summary = { verified: 0, to_verify: 0, undeterminable: 0 };
   for (const f of res.report.findings) summary[f.status]++;
   return { id: insp.id, status: 'DONE', summary };
  });
 }
 /** Structured input for conformant calculation software; available once the inspection report exists. */
 @Get('assignments/:id/export')
 @Header('Cache-Control', 'no-store')
 @Header('X-Content-Type-Options', 'nosniff')
 async export(@Param('id', new ParseUUIDPipe()) id: string, @Query('format') format: string | undefined, @Headers('authorization') token?: string) {
  const { c, a } = await this.accepted(token, id);
  if (format !== undefined && format !== 'json' && format !== 'csv') throw new BadRequestException('format must be json or csv');
  const [apeCase, insp, evidence, reviewed] = await Promise.all([
   this.db.apeCase.findUniqueOrThrow({ where: { id: a.caseId }, include: { property: true } }),
   this.db.inspection.findUnique({ where: { assignmentId: a.id } }),
   this.db.evidence.findMany({ where: { caseId: a.caseId, organizationId: a.organizationId }, select: { id: true, kind: true, mimeType: true, sha256: true, sizeBytes: true }, orderBy: { createdAt: 'asc' } }),
   this.db.extractedField.findMany({ where: { caseId: a.caseId, organizationId: a.organizationId }, select: { field: true, value: true, unit: true, status: true, modelId: true, evidenceId: true } }),
  ]);
  if (!insp || insp.status !== 'DONE' || !insp.report || !insp.performedAt) throw new ConflictException('Inspection report required before export');
  const doc = buildCaseExport({
   generatedBy: `certifier:${c.userSubject}`, now: new Date(),
   apeCase: { id: apeCase.id, status: apeCase.status },
   property: { address: apeCase.property.address, city: apeCase.property.city, region: apeCase.property.region, floorAreaM2: apeCase.property.floorAreaM2 },
   inspection: { performedAt: insp.performedAt, report: insp.report as unknown as InspectionReport },
   evidence, reviewed,
  });
  await this.db.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'case.export', resourceId: a.caseId } });
  if (format === 'csv') return new StreamableFile(Buffer.from('\ufeff' + findingsCsv(doc), 'utf8'), { type: 'text/csv; charset=utf-8', disposition: `attachment; filename="ape-italia-${a.caseId}-rilievi.csv"` });
  return doc;
 }
}
