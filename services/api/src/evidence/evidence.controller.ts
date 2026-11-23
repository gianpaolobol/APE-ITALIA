import {
 BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpException, HttpStatus,
 Inject, NotFoundException, Optional, Param, ParseUUIDPipe, Post, ServiceUnavailableException, UnprocessableEntityException,
 UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { canWrite } from '../tenant-policy';
import { evidenceStorageKey, type ObjectStorage } from './storage';
import { EVIDENCE_KINDS, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS, isAllowedForKind, maxBytesFor, notConfiguredScanner, sniffMimeType, stripJpegMetadata, type EvidenceKind, type MalwareScanner } from './file-policy';
import { CURRENT_NOTICES, UPLOAD_OPEN_STATUSES, isCurrentNotice } from './consent-policy';
import { EVIDENCE_PUBLIC_FIELDS, evidenceFile } from './read';
import { InvalidVideoError, VideoToolMissingError, sanitizeVideo } from './video';

export const EVIDENCE_STORAGE = Symbol('EVIDENCE_STORAGE');
export const MALWARE_SCANNER = Symbol('MALWARE_SCANNER');
type UploadedBlob = { buffer: Buffer; size: number };


@Controller('v1')
export class EvidenceController {
 constructor(
  @Inject(PrismaService) private readonly db: PrismaService,
  @Inject(AuthService) private readonly auth: AuthService,
  @Optional() @Inject(EVIDENCE_STORAGE) private readonly storage: ObjectStorage | null = null,
  @Optional() @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner = notConfiguredScanner,
 ) {}

 private async tenantCase(caseId: string, organizationId: string) {
  const found = await this.db.apeCase.findFirst({ where: { id: caseId, organizationId } });
  if (!found) throw new NotFoundException('Case not found');
  return found;
 }

 @Get('notices')
 notices() {
  return CURRENT_NOTICES;
 }

 @Post('cases/:caseId/consents')
 async consent(@Param('caseId', new ParseUUIDPipe()) caseId: string, @Body() body: { kind?: unknown; version?: unknown } | undefined,
  @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  if (!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  if (!isCurrentNotice(body?.kind, body?.version)) throw new BadRequestException('Unknown or outdated notice version');
  await this.tenantCase(caseId, s.organizationId);
  const kind = body!.kind as string, version = body!.version as string;
  return this.db.$transaction(async tx => {
   const where = { caseId_subject_kind_version: { caseId, subject: s.actorId, kind, version } };
   const existing = await tx.consent.findUnique({ where });
   if (existing) return existing;
   const c = await tx.consent.create({ data: { organizationId: s.organizationId, caseId, subject: s.actorId, kind, version } });
   await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'consent.accept', resourceId: c.id } });
   return c;
  });
 }

 @Post('cases/:caseId/evidence')
 @Throttle({ default: { limit: 30, ttl: 60_000 } })
 // No dest/storage option: multer keeps the file in memory (bounded by fileSize), never on public disk.
 @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VIDEO_BYTES, files: 1, fields: 4, parts: 5 } }))
 async upload(@Param('caseId', new ParseUUIDPipe()) caseId: string, @UploadedFile() file: UploadedBlob | undefined, @Body() body: { kind?: unknown } | undefined,
  @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  if (!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  if (!this.storage) throw new ServiceUnavailableException('Evidence storage not configured');
  const kind = body?.kind;
  if (typeof kind !== 'string' || !(EVIDENCE_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Invalid evidence kind');
  const apeCase = await this.tenantCase(caseId, s.organizationId);
  if (!(UPLOAD_OPEN_STATUSES as readonly string[]).includes(apeCase.status)) throw new ConflictException('Case no longer accepts evidence');
  const consent = await this.db.consent.findUnique({ where: { caseId_subject_kind_version: { caseId, subject: s.actorId, kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing } } });
  if (!consent) throw new ForbiddenException('Consent to the current evidence notice is required');
  if (!file || !Buffer.isBuffer(file.buffer) || file.size === 0) throw new BadRequestException('File required');
  if (file.buffer.length > maxBytesFor(kind as EvidenceKind)) throw new HttpException('File too large for this evidence kind', HttpStatus.PAYLOAD_TOO_LARGE);
  let mime = sniffMimeType(file.buffer);
  if (!mime) throw new HttpException('Unsupported file type', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  if (!isAllowedForKind(kind as EvidenceKind, mime)) throw new HttpException('File type not allowed for this evidence kind', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  let content = file.buffer;
  if (mime === 'image/jpeg') {
   const stripped = stripJpegMetadata(content);
   if (!stripped) throw new UnprocessableEntityException('Malformed JPEG');
   content = stripped;
  }
  if (kind === 'video') {
   // Re-mux without metadata (GPS, device) and without audio; enforce the maximum duration.
   try { content = (await sanitizeVideo(content, MAX_VIDEO_SECONDS)).data; mime = 'video/mp4'; }
   catch (e) {
    if (e instanceof VideoToolMissingError) throw new ServiceUnavailableException('Video processing not available');
    if (e instanceof InvalidVideoError) throw new UnprocessableEntityException(e.message);
    throw e;
   }
  }
  const sha256 = createHash('sha256').update(content).digest('hex');
  if (await this.db.evidence.findUnique({ where: { caseId_sha256: { caseId, sha256 } } })) throw new ConflictException('Duplicate file for this case');
  let scanStatus: Awaited<ReturnType<MalwareScanner['scan']>>;
  try { scanStatus = await this.scanner.scan(content); }
  catch { throw new ServiceUnavailableException('Malware scanner unavailable: upload refused'); }
  if (scanStatus === 'infected') throw new UnprocessableEntityException('File rejected by malware scan');
  const id = randomUUID();
  const storageKey = evidenceStorageKey(s.organizationId, caseId, id);
  await this.storage.put(storageKey, content);
  try {
   return await this.db.$transaction(async tx => {
    const ev = await tx.evidence.create({
     data: { id, caseId, organizationId: s.organizationId, kind, storageKey, mimeType: mime, sizeBytes: content.length, sha256, uploadedBy: s.actorId, scanStatus },
     select: EVIDENCE_PUBLIC_FIELDS,
    });
    await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'evidence.upload', resourceId: id } });
    return ev;
   });
  } catch (e) {
   await this.storage.delete(storageKey).catch(() => undefined); // compensate: no orphaned objects
   if ((e as { code?: string }).code === 'P2002') throw new ConflictException('Duplicate file for this case');
   throw e;
  }
 }

 @Get('cases/:caseId/evidence')
 async list(@Param('caseId', new ParseUUIDPipe()) caseId: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  await this.tenantCase(caseId, s.organizationId);
  return this.db.evidence.findMany({
   where: { caseId, organizationId: s.organizationId },
   select: EVIDENCE_PUBLIC_FIELDS,
   orderBy: { createdAt: 'asc' },
  });
 }

 @Get('evidence/:id/content')
 @Header('Cache-Control', 'no-store')
 @Header('X-Content-Type-Options', 'nosniff')
 async content(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  const ev = await this.db.evidence.findFirst({ where: { id, organizationId: s.organizationId } });
  if (!ev) throw new NotFoundException('Evidence not found');
  const file = await evidenceFile(this.storage, ev);
  await this.db.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'evidence.read', resourceId: ev.id } });
  return file;
 }
}
