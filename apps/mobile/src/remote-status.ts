/** Customer-side status of a request sent to the server, mapped onto the local Job shape for display. */
import { api, download } from './server';
import type { Job } from './job';

type InspectionResp = { caseStatus: string; inspection: { status: string; scheduledAt: string; performedAt: string | null; certifierName: string } | null;
 certifier: { name: string; registrationId: string } | null; call: { at: string; url: string } | null };
type CertResp = { certificate: { regionalId: string; energyClass: string | null; depositedAt: string } | null };

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
  if (c.certificate) { job.status = 'consegnata'; job.ape = { code: c.certificate.regionalId, energyClass: c.certificate.energyClass ?? '—', deliveredAt: c.certificate.depositedAt }; }
 }
 return { job, caseStatus: r.caseStatus };
}

export async function downloadCertificate(caseId: string): Promise<string> {
 return download(`/v1/cases/${caseId}/certificate/content`, `ape-${caseId}.pdf`, true);
}

export type PaymentState = { enabled: boolean; payable: boolean; paid: boolean; amountCents: number | null };
export const fetchPayment = (caseId: string) => api<PaymentState>(`/v1/cases/${caseId}/payment`, { org: true });
export const startPayment = (caseId: string) => api<{ url: string; amountCents: number }>(`/v1/cases/${caseId}/payment`, { org: true, body: {} });
