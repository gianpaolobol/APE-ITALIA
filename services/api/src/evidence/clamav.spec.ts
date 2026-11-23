import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:net';
import { ClamdScanner, ScannerUnavailableError, scannerFromEnv } from './clamav';
import { EvidenceController } from './evidence.controller';
import { CURRENT_NOTICES } from './consent-policy';
import { jpegWithExif } from './fixtures';

/** Minimal clamd INSTREAM implementation for protocol tests. */
function fakeClamd(behaviour: 'answer' | 'silent' | 'garbage', signature = 'SYNTHETIC-MALWARE'): Promise<{ server: Server; port: number; received: () => Buffer }> {
 return new Promise(resolve => {
  let payload = Buffer.alloc(0);
  const server = createServer(sock => {
   let buf = Buffer.alloc(0), headerDone = false;
   sock.on('data', d => {
    buf = Buffer.concat([buf, d]);
    if (!headerDone) { const i = buf.indexOf(0); if (i === -1) return; expect(buf.subarray(0, i).toString()).toBe('zINSTREAM'); buf = buf.subarray(i + 1); headerDone = true; }
    while (buf.length >= 4) {
     const len = buf.readUInt32BE(0);
     if (buf.length < 4 + len) return;
     if (len === 0) {
      if (behaviour === 'silent') return;
      sock.end(behaviour === 'garbage' ? 'what?\0' : payload.includes(Buffer.from(signature)) ? 'stream: Test.Signature FOUND\0' : 'stream: OK\0');
      return;
     }
     payload = Buffer.concat([payload, buf.subarray(4, 4 + len)]);
     buf = buf.subarray(4 + len);
    }
   });
  });
  server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as { port: number }).port, received: () => payload }));
 });
}

let server: Server | undefined;
afterEach(() => { server?.close(); server = undefined; });

describe('clamd INSTREAM adapter', () => {
 it('reports clean files and streams them in chunks', async () => {
  const f = await fakeClamd('answer'); server = f.server;
  const data = Buffer.alloc(200_000, 7);
  expect(await new ClamdScanner('127.0.0.1', f.port, 5000, 1000).scan(data)).toBe('clean');
  expect(f.received().equals(data)).toBe(true);
 });
 it('reports infected files', async () => {
  const f = await fakeClamd('answer'); server = f.server;
  expect(await new ClamdScanner('127.0.0.1', f.port).scan(Buffer.from('xx SYNTHETIC-MALWARE xx'))).toBe('infected');
 });
 it('fails closed on timeout, unexpected replies and connection errors', async () => {
  const silent = await fakeClamd('silent'); server = silent.server;
  await expect(new ClamdScanner('127.0.0.1', silent.port, 300).scan(Buffer.from('a'))).rejects.toBeInstanceOf(ScannerUnavailableError);
  silent.server.close();
  const garbage = await fakeClamd('garbage'); server = garbage.server;
  await expect(new ClamdScanner('127.0.0.1', garbage.port).scan(Buffer.from('a'))).rejects.toBeInstanceOf(ScannerUnavailableError);
  await expect(new ClamdScanner('127.0.0.1', 1, 1000).scan(Buffer.from('a'))).rejects.toBeInstanceOf(ScannerUnavailableError);
 });
 it('is enabled only when CLAMAV_HOST is set', () => {
  expect(scannerFromEnv({})).toBeNull();
  expect(scannerFromEnv({ CLAMAV_HOST: 'clamav' })).toBeInstanceOf(ClamdScanner);
 });
});

describe('upload with an unavailable scanner', () => {
 it('refuses the upload (503) and stores nothing', async () => {
  const put = vi.fn();
  const db = {
   apeCase: { findFirst: async () => ({ id: 'c', organizationId: 'o', status: 'DRAFT' }) },
   consent: { findUnique: async () => ({ id: 'consent' }) },
   evidence: { findUnique: async () => null },
  };
  const auth = { authorize: async () => ({ organizationId: '123e4567-e89b-42d3-a456-426614174000', actorId: 'u', role: 'member' }) };
  const scanner = { scan: async () => { throw new ScannerUnavailableError('down'); } };
  const c = new EvidenceController(db as never, auth as never, { put, get: vi.fn(), delete: vi.fn() }, scanner);
  const img = jpegWithExif();
  await expect(c.upload('223e4567-e89b-42d3-a456-426614174000', { buffer: img, size: img.length }, { kind: 'boiler' }, 'Bearer t', 'o')).rejects.toThrow('Malware scanner unavailable');
  expect(put).not.toHaveBeenCalled();
  expect(CURRENT_NOTICES.evidence_processing).toBeTruthy();
 });
});
