/** Sends a completed local request to the APE Italia API (only when the app is configured with a server). */
import { ApeApi } from './api';
import { resolveApiSession } from './session';
import { appAuthConfig, oidcClient } from './auth/runtime';
import { PROVINCES, pruneHidden, type Answers, type Photos } from './survey/questions';
import { estimate } from './energy/estimate';
import { quote } from './pricing';
import type { EvidenceKind } from './evidence';

export const serverConfigured = (): boolean => !!appAuthConfig && !!oidcClient;

const KIND: Record<string, EvidenceKind> = {
 cadastralPlan: 'floorplan', heatingLogbook: 'document', previousApe: 'document', generatorManual: 'document',
 generatorPlate: 'boiler', dhwPlate: 'boiler', coolingPlate: 'heating', emitterPhotos: 'heating', renewablePhotos: 'heating',
 wallPhotos: 'envelope', windowPhotos: 'window',
};

export type SubmitProgress = (label: string, ratio: number) => void;

export type SubmitCheckpoint = (p: { remoteCaseId: string; uploaded: string[] }) => void;

/**
 * Idempotent: a retry reuses the case already created and skips files already uploaded.
 * Only answers and photos of visible questions are sent.
 */
export async function submitToServer(input: { answers: Answers; photos: Photos; remoteCaseId?: string; uploaded?: string[] }, onProgress: SubmitProgress, checkpoint: SubmitCheckpoint): Promise<{ caseId: string }> {
 const { answers, photos } = pruneHidden(input.answers, input.photos);
 if (!appAuthConfig || !oidcClient) throw new Error('Server non configurato');
 if (!(await oidcClient.getSession())) await oidcClient.login();
 const r = await resolveApiSession(oidcClient, appAuthConfig.apiBaseUrl, undefined);
 if (!r.session) throw new Error('Account senza organizzazione attiva');
 const api = new ApeApi(r.session);
 let caseId = input.remoteCaseId;
 const uploaded = [...(input.uploaded ?? [])];
 if (!caseId) {
 onProgress('Creo la richiesta', 0.05);
 const province = PROVINCES.find(p => p.value === answers.province)?.label ?? String(answers.province ?? '');
 const property = await api.createProperty({
  address: [answers.street, answers.unit].filter(Boolean).join(', '),
  city: `${String(answers.municipality ?? '')} (${province})`,
  region: 'Emilia-Romagna',
  ...(typeof answers.floorArea === 'number' ? { floorAreaM2: answers.floorArea } : {}),
 });
 const c = await api.createCase(property.id);
 caseId = c.id;
 const notices = await api.getNotices();
 // The customer accepted the processing notice in the survey (dataNotice + privacy questions).
 await api.giveConsent(c.id, notices.evidence_processing);
 checkpoint({ remoteCaseId: c.id, uploaded });
 }
 const est = estimate(answers);
 await api.saveSurvey(caseId, { answers, estimate: est, quote: quote(answers), app: 'mobile-1' }).catch(() => undefined);
 const files = Object.entries(photos).flatMap(([q, list]) => (list ?? []).map(p => ({ q, p }))).filter(f => !uploaded.includes(f.p.uri));
 let i = 0;
 for (const { q, p } of files) {
  onProgress(`Carico foto e documenti (${i + 1}/${files.length})`, 0.1 + (0.8 * i) / Math.max(1, files.length));
  await api.uploadEvidence(caseId, KIND[q] ?? 'document', { uri: p.uri, name: p.name, mimeType: p.mimeType });
  uploaded.push(p.uri);
  checkpoint({ remoteCaseId: caseId, uploaded });
  i++;
 }
 onProgress('Invio ai certificatori', 0.95);
 await api.submitCase(caseId);
 onProgress('Fatto', 1);
 return { caseId };
}
