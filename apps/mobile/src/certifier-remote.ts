/** Certifier side against the server: assignments, dossier, appointments, report, certificate. */
import { api, download, sessionBoundary } from './server';
import { reportFromVerbale, type Job, type Verbale } from './job';
import type { Answers, PhotoRef, Photos } from './survey/questions';
import type { Draft } from './survey/drafts';

export type RemoteAssignment = {
 id: string; status: 'OFFERED' | 'ACCEPTED'; offeredAt: string; expiresAt: string; caseId: string; caseStatus: string;
 property: { address?: string; city: string; region: string; floorAreaM2?: number | null };
 summary: { propertyType: string | null; floorArea: number | null; province: string | null; urgency: string | null; hasPlan: string | null; estimatedClass: string | null; payout: number | null };
 call: { at: string; url: string } | null;
};
type EvidenceRow = { id: string; kind: string; mimeType: string; sizeBytes: number; scanStatus: string };
type InspectionRow = { status: string; scheduledAt: string; performedAt: string | null } | null;

export const listAssignments = () => api<RemoteAssignment[]>('/v1/certifier/assignments');
export const acceptAssignment = (id: string) => api(`/v1/certifier/assignments/${id}/accept`, { body: {} });
export const declineAssignment = (id: string) => api(`/v1/certifier/assignments/${id}/decline`, { body: { reason: 'Non disponibile' } });

/** Minimal answers for an offer (before acceptance only the non-personal summary is visible). */
export function offerDraft(a: RemoteAssignment): Draft {
 const s = a.summary;
 const answers: Answers = { municipality: a.property.city, ...(s.propertyType ? { propertyType: s.propertyType } : {}), ...(typeof s.floorArea === 'number' ? { floorArea: s.floorArea } : {}),
  ...(s.province ? { province: s.province } : {}), ...(s.urgency ? { urgency: s.urgency } : {}), ...(s.hasPlan ? { hasPlan: s.hasPlan } : {}) };
 return { id: a.id, createdAt: a.offeredAt, updatedAt: a.offeredAt, answers, photos: {}, status: 'inviata', ...(a.status === 'ACCEPTED' ? { job: { status: 'accettata', certifier: { name: '', sace: '' } } } : {}) };
}

/** Full dossier after acceptance: survey answers, media (images/PDF downloaded to cache), schedule state. */
export async function loadDossier(a: RemoteAssignment, me: { name: string; sace: string }): Promise<Draft> {
 const guard = sessionBoundary();
 const [survey, evidence, insp] = await Promise.all([
  api<{ survey: { answers?: Answers } | null }>(`/v1/certifier/assignments/${a.id}/survey`),
  api<EvidenceRow[]>(`/v1/certifier/assignments/${a.id}/evidence`),
  api<{ inspection: InspectionRow }>(`/v1/certifier/assignments/${a.id}/inspection`),
 ]);
 guard();
 const photos: Photos = {};
 for (const e of evidence.filter(x => x.scanStatus === 'clean')) {
  guard();
  const ext = e.mimeType === 'application/pdf' ? 'pdf' : e.mimeType.startsWith('video/') ? 'mp4' : 'jpg';
  // Videos are downloaded only when played (they can be large).
  const uri = e.mimeType.startsWith('video/') ? `remote:${a.id}:${e.id}` : await download(`/v1/certifier/assignments/${a.id}/evidence/${e.id}/content`, `${e.id}.${ext}`);
  guard();
  const ref: PhotoRef = { uri, name: `${e.kind}.${ext}`, mimeType: e.mimeType, takenAt: '' };
  (photos[`kind:${e.kind}`] ??= []).push(ref);
 }
 const job: Job = { status: a.caseStatus === 'DEPOSITED' || a.caseStatus === 'DELIVERED' ? 'consegnata' : 'accettata', certifier: me };
 if (a.call) job.call = a.call;
 if (insp.inspection) job.visit = { at: insp.inspection.scheduledAt };
 if (insp.inspection?.performedAt) job.verbale = { date: new Date(insp.inspection.performedAt).toLocaleDateString('it-IT'), start: '', end: '', attendees: '', checks: [], notes: '', ownerName: '', ownerConfirmed: true, declaration: true, savedAt: insp.inspection.performedAt };
 guard();
 return { id: a.id, createdAt: a.offeredAt, updatedAt: new Date().toISOString(), answers: survey.survey?.answers ?? {}, photos, status: 'inviata', job };
}

export async function resolveVideo(uri: string): Promise<string> {
 const m = /^remote:([^:]+):(.+)$/.exec(uri);
 return m ? download(`/v1/certifier/assignments/${m[1]}/evidence/${m[2]}/content`, `${m[2]}.mp4`) : uri;
}

export const scheduleCall = (id: string, at: string) => api<{ at: string; url: string }>(`/v1/certifier/assignments/${id}/call`, { body: { at } });
export const scheduleVisit = (id: string, at: string) => api(`/v1/certifier/assignments/${id}/inspection`, { body: { scheduledAt: at } });
export const submitReport = (id: string, answers: Answers, v: Verbale) => api(`/v1/certifier/assignments/${id}/inspection/report`, { body: reportFromVerbale(answers, v) });

export async function deliverCertificate(id: string, code: string, energyClass: string, pdf: { uri: string; name: string; mimeType: string }) {
 const form = new FormData();
 form.append('regionalId', code);
 form.append('energyClass', energyClass);
 form.append('depositedAt', new Date().toISOString());
 form.append('declaration', 'true');
 form.append('file', { uri: pdf.uri, name: pdf.name, type: 'application/pdf' } as unknown as Blob);
 return api(`/v1/certifier/assignments/${id}/certificate`, { form, timeoutMs: 120_000 });
}
