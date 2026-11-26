/** Sends a completed local request to the APE Italia API (only when the app is configured with a server). */
import { randomUUID } from 'expo-crypto';
import { api, freshSession, sessionBoundary, serverEnabled, uploadResumable } from './server';
import { PROVINCES, pruneHidden, type Answers, type Photos, type PhotoRef } from './survey/questions';
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

export type SubmitState = { remoteCreationKey?: string; remoteCaseId?: string; remotePropertyId?: string; uploaded?: string[]; videoUploads?: Record<string, string>; remoteOwner?: { subject: string; organizationId: string } };
export type SubmitCheckpoint = (p: SubmitState) => void | Promise<void>;
export type SubmitMediaReader = (questionId: string, photo: PhotoRef, use: (uri: string) => Promise<void>) => Promise<void>;

/**
 * Reuses acknowledged IDs and a durable scoped key for property/case creation. Upload
 * initialization and other external operations have separate retry semantics.
 * Only answers and photos of visible questions are sent.
 */
export async function submitToServer(input: { answers: Answers; photos: Photos } & SubmitState, onProgress: SubmitProgress, checkpoint: SubmitCheckpoint, readMedia?: SubmitMediaReader): Promise<{ caseId: string }> {
 const { answers, photos } = pruneHidden(input.answers, input.photos);
 if (!serverEnabled()) throw new Error('Server non configurato');
 if (answers.dataNotice !== true || answers.privacy !== true) throw new Error('Accetta l’informativa e la condivisione prima di inviare.');
 const guard = sessionBoundary();
 const session = await freshSession();
 guard();
 if (!session?.organizationId) throw new Error('Accedi per continuare');
 const remoteOwner = { subject: session.subject, organizationId: session.organizationId };
 if (input.remoteOwner && (input.remoteOwner.subject !== remoteOwner.subject || input.remoteOwner.organizationId !== remoteOwner.organizationId)) throw new Error('La richiesta appartiene a un altro account.');
 const call = <T>(path: string, init?: Parameters<typeof api>[1]): Promise<T> => { guard(); return api<T>(path, init); };
 const remoteCreationKey = input.remoteCreationKey ?? randomUUID();
 let caseId = input.remoteCaseId;
 let propertyId = input.remotePropertyId;
 const uploaded = [...(input.uploaded ?? [])];
 const videoUploads = { ...(input.videoUploads ?? {}) };
 const save = async () => { guard(); await checkpoint({ remoteCreationKey, remoteOwner, remotePropertyId: propertyId, remoteCaseId: caseId, uploaded: [...uploaded], videoUploads: { ...videoUploads } }); guard(); };
 // Resolve acknowledged cases before repeating writes, including a lost submit response.
 if (caseId) {
  const c = await call<{ status: string }>(`/v1/cases/${caseId}`, { org: true });
  if (c.status === 'CANCELLED') throw new Error('La richiesta è stata annullata.');
  if (['SUBMITTED', 'AWAITING_EVIDENCE', 'ASSIGNED', 'INSPECTION_SCHEDULED', 'INSPECTION_DONE', 'UNDER_REVIEW', 'DEPOSITED', 'DELIVERED'].includes(c.status)) {
   await save();
   return { caseId };
  }
  if (c.status !== 'DRAFT') throw new Error('Stato della richiesta non riconosciuto.');
 }
 await save();
 // Check the notice before sending personal property data or creating any new server record.
 // A previously submitted case can still be recovered without repeating writes.
 const displayedNoticeVersion = '2026-11-23-draft';
 const notices = await call<{ evidence_processing: string }>('/v1/notices');
 if (notices.evidence_processing !== displayedNoticeVersion) throw new Error('Informativa aggiornata: aggiorna l’app prima di accettare e inviare.');
 if (!caseId) {
 onProgress('Creo la richiesta', 0.05);
 const province = PROVINCES.find(p => p.value === answers.province)?.label ?? String(answers.province ?? '');
 if (!propertyId) {
 const property = await call<{ id: string }>('/v1/properties', { org: true, body: {
  idempotencyKey: remoteCreationKey,
  address: [answers.street, answers.unit].filter(Boolean).join(', '),
  city: `${String(answers.municipality ?? '')} (${province})`,
  region: 'Emilia-Romagna',
  ...(typeof answers.floorArea === 'number' ? { floorAreaM2: answers.floorArea } : {}),
 } });
 propertyId = property.id;
 await save();
 }
 const c = await call<{ id: string }>('/v1/cases', { org: true, body: { propertyId, idempotencyKey: remoteCreationKey } });
 caseId = c.id;
 await save();
 }
 // Consent creation is idempotent for the actor and version; retry even if a previous request failed.
 await call(`/v1/cases/${caseId}/consents`, { org: true, body: { kind: 'evidence_processing', version: displayedNoticeVersion } });
 const est = estimate(answers);
 await call(`/v1/cases/${caseId}/survey`, { org: true, body: { answers, estimate: est, quote: quote(answers), app: 'mobile-2' } });
 const files = Object.entries(photos).flatMap(([q, list]) => (list ?? []).map(p => ({ q, p }))).filter(f => !uploaded.includes(f.p.uri));
 let i = 0;
 for (const { q, p } of files) {
  onProgress(`Carico foto e documenti (${i + 1}/${files.length})`, 0.1 + (0.8 * i) / Math.max(1, files.length));
  let started = false, acknowledged = false;
  const upload = async (clearUri: string) => {
   guard();
   if (started) throw new Error('Lettura allegato duplicata');
   started = true;
   if (/\.apem$/i.test(clearUri)) throw new Error('Allegato cifrato non aperto');
   if (p.mimeType.startsWith('video/')) {
    const base = 0.1 + (0.8 * i) / Math.max(1, files.length);
    guard();
    await uploadResumable(caseId!, 'video', clearUri, r => onProgress(`Carico il video (${Math.round(r * 100)}%)`, base + (0.8 / Math.max(1, files.length)) * r), videoUploads[p.uri], async id => { videoUploads[p.uri] = id; await save(); });
    delete videoUploads[p.uri];
   } else {
    const form = new FormData();
    form.append('kind', KIND[q] ?? 'document');
    form.append('file', { uri: clearUri, name: p.name, type: p.mimeType } as unknown as Blob);
    await call(`/v1/cases/${caseId}/evidence`, { org: true, form, timeoutMs: 120_000 });
   }
   guard();
   // Record a confirmed server receipt before the reader releases its cache.
   // If cleanup fails, this attempt still fails, but a retry need not upload
   // the already acknowledged attachment a second time.
   uploaded.push(p.uri);
   await save();
   acknowledged = true;
  };
  if (readMedia) await readMedia(q, p, upload);
  else {
   if (/\.apem$/i.test(p.uri)) throw new Error('Lettura allegato cifrato non disponibile');
   await upload(p.uri);
  }
  guard();
  if (!acknowledged) throw new Error('Invio allegato non confermato');
  i++;
 }
 onProgress('Invio ai certificatori', 0.95);
 await call(`/v1/cases/${caseId}/submit`, { org: true, body: {} });
 onProgress('Fatto', 1);
 return { caseId };
}
