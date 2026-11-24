import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mock = vi.hoisted(() => ({ api: vi.fn(), download: vi.fn(), guard: vi.fn() }));
vi.mock('./server', () => ({
 api: mock.api, download: mock.download, sessionBoundary: () => mock.guard,
 ServerError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock('expo-crypto', () => ({
 CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
 digest: async (_algorithm: string, bytes: Uint8Array) => {
  const hash = createHash('sha256').update(bytes).digest();
  return Uint8Array.from(hash).buffer;
 },
}));
import { downloadCertificate, fetchRemoteJob } from './remote-status';

const pdf = Uint8Array.from(Buffer.from('%PDF-1.7\nsynthetic'));
const sha256 = createHash('sha256').update(pdf).digest('hex');
const meta = { regionalId: 'SYNTH', energyClass: 'A1', depositedAt: '2026-01-01', sizeBytes: pdf.length, sha256 };
function downloaded(bytes: Uint8Array, size = bytes.length) {
 mock.download.mockImplementation(async (_path, _name, _org, validate) => {
  await validate({ size, bytes: async () => bytes });
  return 'file:///synthetic.pdf';
 });
}
beforeEach(() => {
 vi.resetAllMocks();
 mock.api.mockResolvedValue({ certificate: meta });
 downloaded(pdf);
});

describe('mobile certificate integrity', () => {
 it('releases only the deposited bytes and uses tenant-authorized metadata and content', async () => {
  await expect(downloadCertificate('case')).resolves.toBe('file:///synthetic.pdf');
  expect(mock.api).toHaveBeenCalledWith('/v1/cases/case/certificate', { org: true });
  expect(mock.download).toHaveBeenCalledWith('/v1/cases/case/certificate/content', 'ape-case.pdf', true, expect.any(Function));
  expect(mock.api).toHaveBeenLastCalledWith('/v1/cases/case/certificate/receipt', { org: true, body: { sha256, sizeBytes: pdf.length } });
 });
 it('rejects a truncated download', async () => {
  downloaded(pdf.subarray(0, pdf.length - 1));
  await expect(downloadCertificate('case')).rejects.toThrow('Attestato incompleto');
 });
 it('rejects same-size changed bytes', async () => {
  const altered = pdf.slice(); altered[altered.length - 1] ^= 1;
  downloaded(altered);
  await expect(downloadCertificate('case')).rejects.toThrow('Integrità attestato non verificata');
  expect(mock.api).toHaveBeenCalledTimes(1);
 });
 it('rejects malformed metadata before downloading', async () => {
  mock.api.mockResolvedValue({ certificate: { ...meta, sha256: 'bad' } });
  await expect(downloadCertificate('case')).rejects.toThrow('Metadati attestato non validi');
  expect(mock.download).not.toHaveBeenCalled();
 });
 it('does not start a download after a session change', async () => {
  mock.guard.mockImplementationOnce(() => { throw new Error('Sessione cambiata'); });
  await expect(downloadCertificate('case')).rejects.toThrow('Sessione cambiata');
  expect(mock.download).not.toHaveBeenCalled();
 });
 it('does not expose a file after a session change during digest', async () => {
  mock.guard.mockImplementationOnce(() => {}).mockImplementationOnce(() => {}).mockImplementationOnce(() => { throw new Error('Sessione cambiata'); });
  await expect(downloadCertificate('case')).rejects.toThrow('Sessione cambiata');
 });
 it('does not expose a file if the receipt cannot be confirmed', async () => {
  mock.api.mockResolvedValueOnce({ certificate: meta }).mockRejectedValueOnce(new Error('Network'));
  await expect(downloadCertificate('case')).rejects.toThrow('Network');
 });
});

describe('remote certificate status', () => {
 it('shows deposited certificate without inventing a delivery date', async () => {
  mock.api.mockResolvedValueOnce({ caseStatus: 'DEPOSITED', certifier: { name: 'Synthetic', registrationId: 'SYNTH' }, inspection: null, call: null }).mockResolvedValueOnce({ certificate: { ...meta, deliveredAt: null } });
  const r = await fetchRemoteJob('case');
  expect(r.job?.status).toBe('accettata');
  expect(r.job?.ape).toMatchObject({ depositedAt: meta.depositedAt, deliveredAt: '' });
 });
 it('uses server receipt date rather than deposit date', async () => {
  mock.api.mockResolvedValueOnce({ caseStatus: 'DELIVERED', certifier: { name: 'Synthetic', registrationId: 'SYNTH' }, inspection: null, call: null }).mockResolvedValueOnce({ certificate: { ...meta, deliveredAt: '2026-01-03' } });
  const r = await fetchRemoteJob('case');
  expect(r.job?.status).toBe('consegnata');
  expect(r.job?.ape?.deliveredAt).toBe('2026-01-03');
 });
});
