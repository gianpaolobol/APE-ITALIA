import { HttpException, HttpStatus, ServiceUnavailableException, StreamableFile } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { ObjectStorage } from './storage';

const EXTENSION: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'application/pdf': 'pdf' };
export const EVIDENCE_PUBLIC_FIELDS = { id: true, caseId: true, kind: true, mimeType: true, sizeBytes: true, sha256: true, scanStatus: true, createdAt: true } as const;

/** Shared download gate for customers and certifiers: scan status, decryption, safe headers. Caller audits. */
export async function evidenceFile(storage: ObjectStorage | null, ev: { id: string; storageKey: string; mimeType: string; scanStatus: string }, integrity?: { sha256: string; sizeBytes: number }): Promise<StreamableFile> {
 if (!storage) throw new ServiceUnavailableException('Evidence storage not configured');
 if (ev.scanStatus === 'infected') throw new HttpException('Evidence quarantined', HttpStatus.GONE);
 if (ev.scanStatus !== 'clean' && process.env.EVIDENCE_ALLOW_UNSCANNED !== '1') throw new HttpException('Evidence awaiting malware scan', HttpStatus.LOCKED);
 const data = await storage.get(ev.storageKey);
 // For certificates, bind the decrypted object to the exact bytes recorded at deposit.
 if (integrity && (data.length !== integrity.sizeBytes || createHash('sha256').update(data).digest('hex') !== integrity.sha256)) {
  throw new ServiceUnavailableException('Stored document integrity check failed');
 }
 return new StreamableFile(data, { type: ev.mimeType, length: data.length, disposition: `attachment; filename="evidence-${ev.id}.${EXTENSION[ev.mimeType] ?? 'bin'}"` });
}
