import {
 BadRequestException, HttpCode, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpException, HttpStatus,
 Inject, NotFoundException, Optional, Param, ParseUUIDPipe, Post, ServiceUnavailableException, UnprocessableEntityException,
 UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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


export const UPLOAD_PART_BYTES = 4 * 1024 * 1024;
export const uploadTmpDir = () => process.env.UPLOAD_TMP_DIR ?? join(tmpdir(), 'ape-uploads');

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
  const { s, kind } = await this.precheck(caseId, body?.kind, token, org);
  if (!file || !Buffer.isBuffer(file.buffer) || file.size === 0) throw new BadRequestException('File required');
  return this.ingest(s, caseId, kind, file.buffer);
 }

 /** Authorization, case state and consent checks shared by direct and chunked uploads. */
 private async precheck(caseId: string, rawKind: unknown, token?: string, org?: string) {
  const s = await this.auth.authorize(token, org);
  if (!canWrite(s.role)) throw new ForbiddenException('Read-only membership');
  if (!this.storage) throw new ServiceUnavailableException('Evidence storage not configured');
  const kind = rawKind;
  if (typeof kind !== 'string' || !(EVIDENCE_KINDS as readonly string[]).includes(kind)) throw new BadRequestException('Invalid evidence kind');
  const apeCase = await this.tenantCase(caseId, s.organizationId);
  if (!(UPLOAD_OPEN_STATUSES as readonly string[]).includes(apeCase.status)) throw new ConflictException('Case no longer accepts evidence');
  const consent = await this.db.consent.findUnique({ where: { caseId_subject_kind_version: { caseId, subject: s.actorId, kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing } } });
  if (!consent) throw new ForbiddenException('Consent to the current evidence notice is required');
  return { s, kind: kind as EvidenceKind };
 }

 /** Content policy, sanitization, malware scan, encrypted storage and record. */
 private async ingest(s: { organizationId: string; actorId: string }, caseId: string, kind: EvidenceKind, input: Buffer, uploadId?: string) {
  if (!this.storage) throw new ServiceUnavailableException('Evidence storage not configured');
  if (input.length > maxBytesFor(kind)) throw new HttpException('File too large for this evidence kind', HttpStatus.PAYLOAD_TOO_LARGE);
  let mime = sniffMimeType(input);
  if (!mime) throw new HttpException('Unsupported file type', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  if (!isAllowedForKind(kind, mime)) throw new HttpException('File type not allowed for this evidence kind', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  let content = input;
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
    // Persist the upload receipt in the same transaction as its evidence and audit event.
    // A retry must never see a committed evidence row but an incomplete upload receipt.
    if (uploadId) {
     const updated = await tx.chunkedUpload.updateMany({ where: { id: uploadId, caseId, organizationId: s.organizationId, createdBy: s.actorId, completedAt: null }, data: { completedAt: new Date(), evidenceId: ev.id } });
     if (updated.count !== 1) throw new ConflictException('Upload already completed');
    }
    await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: 'evidence.upload', resourceId: id } });
    return ev;
   });
  } catch (e) {
   await this.storage.delete(storageKey).catch(() => undefined); // compensate: no orphaned objects
   if ((e as { code?: string }).code === 'P2002') throw new ConflictException('Duplicate file for this case');
   throw e;
  }
 }

 // ---- Resumable uploads (large videos on mobile networks) ----
 // Parts are base64 text bodies (portable from React Native), stored in a private temp directory until
 // completion; the assembled file then goes through the same ingest pipeline as direct uploads.

 @Post('cases/:caseId/uploads')
 @Throttle({ default: { limit: 10, ttl: 60_000 } })
 async startUpload(@Param('caseId', new ParseUUIDPipe()) caseId: string, @Body() body: { kind?: unknown; totalBytes?: unknown } | undefined,
  @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const { s, kind } = await this.precheck(caseId, body?.kind, token, org);
  const total = body?.totalBytes;
  if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0 || total > maxBytesFor(kind)) throw new BadRequestException('totalBytes out of range');
  const up = await this.db.chunkedUpload.create({ data: { caseId, organizationId: s.organizationId, kind, totalBytes: total, partSize: UPLOAD_PART_BYTES, receivedParts: [], createdBy: s.actorId } });
  return { uploadId: up.id, partSize: up.partSize, parts: Math.ceil(total / up.partSize) };
 }

 @Get('cases/:caseId/uploads/:uploadId')
 async uploadStatus(@Param('caseId', new ParseUUIDPipe()) caseId: string, @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  const up = await this.db.chunkedUpload.findFirst({ where: { id: uploadId, caseId, organizationId: s.organizationId, createdBy: s.actorId } });
  if (!up) throw new NotFoundException('Upload not found');
  return { uploadId: up.id, receivedParts: up.receivedParts, completed: !!up.completedAt, evidenceId: up.evidenceId };
 }

 @Post('cases/:caseId/uploads/:uploadId/parts/:n')
 @HttpCode(204)
 @Throttle({ default: { limit: 120, ttl: 60_000 } })
 async uploadPart(@Param('caseId', new ParseUUIDPipe()) caseId: string, @Param('uploadId', new ParseUUIDPipe()) uploadId: string, @Param('n') nRaw: string,
  @Body() body: Buffer | undefined, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  const up = await this.db.chunkedUpload.findFirst({ where: { id: uploadId, caseId, organizationId: s.organizationId, createdBy: s.actorId, completedAt: null } });
  if (!up) throw new NotFoundException('Upload not found');
  const n = Number(nRaw), parts = Math.ceil(up.totalBytes / up.partSize);
  if (!Number.isInteger(n) || n < 0 || n >= parts) throw new BadRequestException('Invalid part number');
  if (!Buffer.isBuffer(body)) throw new BadRequestException('Part body required (text/plain base64)');
  const data = Buffer.from(body.toString('latin1'), 'base64');
  const expected = n === parts - 1 ? up.totalBytes - n * up.partSize : up.partSize;
  if (data.length !== expected) throw new BadRequestException(`Part ${n} must be ${expected} bytes`);
  const dir = join(uploadTmpDir(), up.id);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(dir, String(n)), data, { mode: 0o600 });
  if (!up.receivedParts.includes(n)) await this.db.chunkedUpload.update({ where: { id: up.id }, data: { receivedParts: { push: n } } });
 }

 @Post('cases/:caseId/uploads/:uploadId/complete')
 async completeUpload(@Param('caseId', new ParseUUIDPipe()) caseId: string, @Param('uploadId', new ParseUUIDPipe()) uploadId: string,
  @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  const up = await this.db.chunkedUpload.findFirst({ where: { id: uploadId, caseId, organizationId: s.organizationId, createdBy: s.actorId } });
  if (!up) throw new NotFoundException('Upload not found');
  if (up.completedAt && up.evidenceId) return this.db.evidence.findUniqueOrThrow({ where: { id: up.evidenceId }, select: EVIDENCE_PUBLIC_FIELDS });
  const { kind } = await this.precheck(caseId, up.kind, token, org);
  const parts = Math.ceil(up.totalBytes / up.partSize);
  const missing = Array.from({ length: parts }, (_, i) => i).filter(i => !up.receivedParts.includes(i));
  if (missing.length) throw new ConflictException(`Missing parts: ${missing.slice(0, 20).join(',')}`);
  const dir = join(uploadTmpDir(), up.id);
  try {
   const buf = Buffer.concat(await Promise.all(Array.from({ length: parts }, (_, i) => readFile(join(dir, String(i))))));
   if (buf.length !== up.totalBytes) throw new ConflictException('Assembled size mismatch');
   const ev = await this.ingest(s, caseId, kind, buf, up.id);
   await rm(dir, { recursive: true, force: true });
   return ev;
  } catch (error) {
   // A concurrent completion may have committed and removed the temporary parts.
   // Recover only the receipt for this exact upload, never an unrelated duplicate file.
   const completed = await this.db.chunkedUpload.findFirst({ where: { id: up.id, caseId, organizationId: s.organizationId, createdBy: s.actorId, completedAt: { not: null } } });
   if (!completed?.evidenceId) throw error;
   return this.db.evidence.findUniqueOrThrow({ where: { id: completed.evidenceId }, select: EVIDENCE_PUBLIC_FIELDS });
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
