/** Customer-side status of a request sent to the server, mapped onto the local Job shape for display. */
import { api, download, sessionBoundary, ServerError } from './server';
import * as Crypto from 'expo-crypto';
import type { Job } from './job';

type InspectionResp = { caseStatus: string; inspection: { status: string; scheduledAt: string; performedAt: string | null; certifierName: string } | null;
 certifier: { name: string; registrationId: string } | null; call: { at: string; url: string } | null };
type CertResp = { certificate: { regionalId: string; energyClass: string | null; depositedAt: string; deliveredAt: string | null; sha256: string; sizeBytes: number } | null };

export async function fetchRemoteJob(caseId: string): Promise<{ job: Job | undefined; caseStatus: string }> {
 const r = await api<InspectionResp>(`/v1/cases/${caseId}/inspection`, { org: true });
 if (!r.certifier) return { job: undefined, caseStatus: r.caseStatus };
 const job: Job = { status: 'accettata', certifier: { name: r.certifier.name, sace: r.certifier.registrationId } };
 if (r.call) job.call = { at: r.call.at, url: r.call.url };
 if (r.inspection && r.inspection.status !== 'CANCELLED') job.visit = { at: r.inspection.scheduledAt };
 if (r.inspection?.performedAt) {
  const d = new Date(r.inspection.performedAt);
  job.verbale = { date: d.toLocaleDateString('it-IT'), start: '', end: '', attendees: '', checks: [], notes: '', ownerName: '', ownerConfirmed: true, declaration: true, savedAt: r.inspection.performedAt };
 }
 if (['DEPOSITED', 'DELIVERED'].includes(r.caseStatus)) {
  const c = await api<CertResp>(`/v1/cases/${caseId}/certificate`, { org: true });
  if (c.certificate) { job.status = c.certificate.deliveredAt ? 'consegnata' : 'accettata'; job.ape = { code: c.certificate.regionalId, energyClass: c.certificate.energyClass ?? '—', deliveredAt: c.certificate.deliveredAt ?? '', depositedAt: c.certificate.depositedAt }; }
 }
 return { job, caseStatus: r.caseStatus };
}

export async function downloadCertificate(caseId: string): Promise<string> {
 const guard = sessionBoundary();
 const { certificate } = await api<CertResp>(`/v1/cases/${caseId}/certificate`, { org: true });
 guard();
 if (!certificate || !/^[a-f0-9]{64}$/.test(certificate.sha256) || !Number.isSafeInteger(certificate.sizeBytes) || certificate.sizeBytes <= 0 || certificate.sizeBytes > 15 * 1024 * 1024) {
  throw new ServerError(422, 'Metadati attestato non validi');
 }
 return download(`/v1/cases/${caseId}/certificate/content`, `ape-${caseId}.pdf`, true, async file => {
  guard();
  if (file.size !== certificate.sizeBytes) throw new ServerError(422, 'Attestato incompleto');
  const bytes = await file.bytes();
  if (bytes.length !== certificate.sizeBytes) throw new ServerError(422, 'Attestato incompleto');
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  guard();
  if (hex !== certificate.sha256) throw new ServerError(422, 'Integrità attestato non verificata');
  await api(`/v1/cases/${caseId}/certificate/receipt`, { org: true, body: { sha256: hex, sizeBytes: bytes.length } });
  guard();
 });
}

export type PaymentState = { enabled: boolean; payable: boolean; paid: boolean; amountCents: number | null };
export const fetchPayment = (caseId: string) => api<PaymentState>(`/v1/cases/${caseId}/payment`, { org: true });
export const startPayment = (caseId: string) => api<{ url: string; amountCents: number }>(`/v1/cases/${caseId}/payment`, { org: true, body: {} });
