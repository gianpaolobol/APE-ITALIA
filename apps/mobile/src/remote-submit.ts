/** Sends a completed local request to the APE Italia API (only when the app is configured with a server). */
import { api, serverEnabled } from './server';
import { PROVINCES, pruneHidden, type Answers, type Photos } from './survey/questions';
import { estimate } from './energy/estimate';
import { quote } from './pricing';
import type { EvidenceKind } from './evidence';

export const serverConfigured = serverEnabled;

const KIND: Record<string, EvidenceKind> = {
 cadastralPlan: 'floorplan', heatingLogbook: 'document', previousApe: 'document', generatorManual: 'document',
 generatorPlate: 'boiler', dhwPlate: 'boiler', coolingPlate: 'heating', emitterPhotos: 'heating', renewablePhotos: 'heating',
 wallPhotos: 'envelope', windowPhotos: 'window', walkthrough: 'video', idDocument: 'document',
};

export type SubmitProgress = (label: string, ratio: number) => void;

export type SubmitCheckpoint = (p: { remoteCaseId: string; uploaded: string[] }) => void;

/**
 * Idempotent: a retry reuses the case already created and skips files already uploaded.
 * Only answers and photos of visible questions are sent.
 */
export async function submitToServer(input: { answers: Answers; photos: Photos; remoteCaseId?: string; uploaded?: string[] }, onProgress: SubmitProgress, checkpoint: SubmitCheckpoint): Promise<{ caseId: string }> {
 const { answers, photos } = pruneHidden(input.answers, input.photos);
 if (!serverEnabled()) throw new Error('Server non configurato');
 let caseId = input.remoteCaseId;
 const uploaded = [...(input.uploaded ?? [])];
 if (!caseId) {
 onProgress('Creo la richiesta', 0.05);
 const province = PROVINCES.find(p => p.value === answers.province)?.label ?? String(answers.province ?? '');
 const property = await api<{ id: string }>('/v1/properties', { org: true, body: {
  address: [answers.street, answers.unit].filter(Boolean).join(', '),
  city: `${String(answers.municipality ?? '')} (${province})`,
  region: 'Emilia-Romagna',
  ...(typeof answers.floorArea === 'number' ? { floorAreaM2: answers.floorArea } : {}),
 } });
 const c = await api<{ id: string }>('/v1/cases', { org: true, body: { propertyId: property.id } });
 caseId = c.id;
 const notices = await api<{ evidence_processing: string }>('/v1/notices');
 // The customer accepted the processing notice in the survey (dataNotice + privacy questions).
 await api(`/v1/cases/${c.id}/consents`, { org: true, body: { kind: 'evidence_processing', version: notices.evidence_processing } });
 checkpoint({ remoteCaseId: c.id, uploaded });
 }
 const est = estimate(answers);
 await api(`/v1/cases/${caseId}/survey`, { org: true, body: { answers, estimate: est, quote: quote(answers), app: 'mobile-2' } });
 const files = Object.entries(photos).flatMap(([q, list]) => (list ?? []).map(p => ({ q, p }))).filter(f => !uploaded.includes(f.p.uri));
 let i = 0;
 for (const { q, p } of files) {
  onProgress(`Carico foto e documenti (${i + 1}/${files.length})`, 0.1 + (0.8 * i) / Math.max(1, files.length));
  const form = new FormData();
  form.append('kind', KIND[q] ?? 'document');
  form.append('file', { uri: p.uri, name: p.name, type: p.mimeType } as unknown as Blob);
  await api(`/v1/cases/${caseId}/evidence`, { org: true, form, timeoutMs: p.mimeType.startsWith('video/') ? 15 * 60_000 : 120_000 });
  uploaded.push(p.uri);
  checkpoint({ remoteCaseId: caseId, uploaded });
  i++;
 }
 onProgress('Invio ai certificatori', 0.95);
 await api(`/v1/cases/${caseId}/submit`, { org: true, body: {} });
 onProgress('Fatto', 1);
 return { caseId };
}
