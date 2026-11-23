import {
 BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, HttpException, HttpStatus, Inject,
 NotFoundException, Optional, Param, ParseUUIDPipe, Post, ServiceUnavailableException, UnprocessableEntityException, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { EVIDENCE_STORAGE, MALWARE_SCANNER } from '../evidence/evidence.controller';
import { evidenceStorageKey, type ObjectStorage } from '../evidence/storage';
import { MAX_EVIDENCE_BYTES, notConfiguredScanner, sniffMimeType, type MalwareScanner } from '../evidence/file-policy';
import { evidenceFile } from '../evidence/read';

type Blob = { buffer: Buffer; size: number };
const REGIONAL_ID = /^[A-Za-z0-9/._-]{3,64}$/;

/**
 * The certifier uploads the APE they produced, signed and deposited in the regional system, with its
 * identifier; the customer downloads it. The platform does not generate or alter certificate content.
 */
@Controller('v1')
export class CertificateController {
 constructor(
  @Inject(PrismaService) private readonly db: PrismaService,
  @Inject(AuthService) private readonly auth: AuthService,
  @Optional() @Inject(EVIDENCE_STORAGE) private readonly storage: ObjectStorage | null = null,
  @Optional() @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner = notConfiguredScanner,
 ) {}

 @Post('certifier/assignments/:id/certificate')
 @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_EVIDENCE_BYTES, files: 1, fields: 6, parts: 7 } }))
 async upload(@Param('id', new ParseUUIDPipe()) id: string, @UploadedFile() file: Blob | undefined,
  @Body() body: { regionalId?: unknown; depositedAt?: unknown; validUntil?: unknown; declaration?: unknown } | undefined, @Headers('authorization') token?: string) {
  const { subject } = await this.auth.verify(token);
  const c = await this.db.certifier.findUnique({ where: { userSubject: subject } });
  if (!c || !c.active || !c.verifiedAt) throw new ForbiddenException('Verified certifier profile required');
  const a = await this.db.assignment.findFirst({ where: { id, certifierId: c.id, status: 'ACCEPTED' } });
  if (!a) throw new NotFoundException('Assignment not found');
  if (!this.storage) throw new ServiceUnavailableException('Storage not configured');
  if (body?.declaration !== 'true') throw new BadRequestException('Declare that the APE was signed and deposited in the regional system');
  const regionalId = typeof body?.regionalId === 'string' ? body.regionalId.trim() : '';
  if (!REGIONAL_ID.test(regionalId)) throw new BadRequestException('regionalId required (identifier assigned by the regional system)');
  const now = new Date();
  const depositedAt = typeof body?.depositedAt === 'string' ? new Date(body.depositedAt) : new Date(NaN);
  if (Number.isNaN(depositedAt.getTime()) || depositedAt.getTime() > now.getTime() + 5 * 60_000) throw new BadRequestException('depositedAt must be a past ISO date');
  let validUntil: Date | null = null;
  if (body?.validUntil !== undefined && body.validUntil !== '') {
   validUntil = typeof body.validUntil === 'string' ? new Date(body.validUntil) : new Date(NaN);
   if (Number.isNaN(validUntil.getTime()) || validUntil <= depositedAt) throw new BadRequestException('validUntil must be after depositedAt');
  }
  if (!file?.buffer?.length) throw new BadRequestException('PDF file required');
  if (sniffMimeType(file.buffer) !== 'application/pdf') throw new HttpException('The certificate must be a PDF', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
  const scanStatus = await this.scanner.scan(file.buffer);
  if (scanStatus === 'infected') throw new UnprocessableEntityException('File rejected by malware scan');
  const apeCase = await this.db.apeCase.findUniqueOrThrow({ where: { id: a.caseId } });
  if (apeCase.status !== 'INSPECTION_DONE') throw new ConflictException('The inspection report must be submitted first');
  const certId = randomUUID();
  const storageKey = evidenceStorageKey(a.organizationId, a.caseId, certId);
  await this.storage.put(storageKey, file.buffer);
  try {
   return await this.db.$transaction(async tx => {
    const moved = await tx.apeCase.updateMany({ where: { id: a.caseId, status: 'INSPECTION_DONE' }, data: { status: 'DEPOSITED' } });
    if (moved.count !== 1) throw new ConflictException('Case state changed');
    const cert = await tx.certificate.create({ data: {
     id: certId, caseId: a.caseId, organizationId: a.organizationId, certifierId: c.id, storageKey,
     sha256: createHash('sha256').update(file.buffer).digest('hex'), sizeBytes: file.buffer.length, scanStatus, regionalId, depositedAt, validUntil,
    } });
    await tx.auditEvent.create({ data: { organizationId: a.organizationId, actorId: `certifier:${c.userSubject}`, action: 'certificate.upload', resourceId: cert.id } });
    return { id: cert.id, regionalId, depositedAt, validUntil, sha256: cert.sha256 };
   });
  } catch (e) {
   await this.storage.delete(storageKey).catch(() => undefined);
   if ((e as { code?: string }).code === 'P2002') throw new ConflictException('Certificate already uploaded');
   throw e;
  }
 }

 @Get('cases/:id/certificate')
 async metadata(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  const cert = await this.db.certificate.findFirst({ where: { caseId: id, organizationId: s.organizationId } });
  return { certificate: cert ? { regionalId: cert.regionalId, depositedAt: cert.depositedAt, validUntil: cert.validUntil, sha256: cert.sha256, sizeBytes: cert.sizeBytes, deliveredAt: cert.deliveredAt } : null };
 }

 /** First download by a member of the requesting organization marks the case as DELIVERED. */
 @Get('cases/:id/certificate/content')
 @Header('Cache-Control', 'no-store')
 @Header('X-Content-Type-Options', 'nosniff')
 async content(@Param('id', new ParseUUIDPipe()) id: string, @Headers('authorization') token?: string, @Headers('x-organization-id') org?: string) {
  const s = await this.auth.authorize(token, org);
  const cert = await this.db.certificate.findFirst({ where: { caseId: id, organizationId: s.organizationId } });
  if (!cert) throw new NotFoundException('Certificate not available');
  const file = await evidenceFile(this.storage, { id: cert.id, storageKey: cert.storageKey, mimeType: 'application/pdf', scanStatus: cert.scanStatus });
  await this.db.$transaction(async tx => {
   const first = await tx.certificate.updateMany({ where: { id: cert.id, deliveredAt: null }, data: { deliveredAt: new Date(), deliveredTo: s.actorId } });
   if (first.count === 1) await tx.apeCase.updateMany({ where: { id, status: 'DEPOSITED' }, data: { status: 'DELIVERED' } });
   await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: s.actorId, action: first.count === 1 ? 'certificate.deliver' : 'certificate.read', resourceId: cert.id } });
  });
  return file;
 }
}
