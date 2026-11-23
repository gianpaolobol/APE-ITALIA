/** Sends a completed local request to the APE Italia API (only when the app is configured with a server). */
import { ApeApi } from './api';
import { resolveApiSession } from './session';
import { appAuthConfig, oidcClient } from './auth/runtime';
import { PROVINCES, type Answers, type Photos } from './survey/questions';
import type { EvidenceKind } from './evidence';

export const serverConfigured = (): boolean => !!appAuthConfig && !!oidcClient;

const KIND: Record<string, EvidenceKind> = {
 cadastralPlan: 'floorplan', heatingLogbook: 'document', previousApe: 'document', generatorManual: 'document',
 generatorPlate: 'boiler', dhwPlate: 'boiler', coolingPlate: 'heating', emitterPhotos: 'heating', renewablePhotos: 'heating',
 wallPhotos: 'envelope', windowPhotos: 'window',
};

export type SubmitProgress = (label: string, ratio: number) => void;

export async function submitToServer(answers: Answers, photos: Photos, onProgress: SubmitProgress): Promise<{ caseId: string }> {
 if (!appAuthConfig || !oidcClient) throw new Error('Server non configurato');
 if (!(await oidcClient.getSession())) await oidcClient.login();
 const r = await resolveApiSession(oidcClient, appAuthConfig.apiBaseUrl, undefined);
 if (!r.session) throw new Error('Account senza organizzazione attiva');
 const api = new ApeApi(r.session);
 onProgress('Creo la richiesta', 0.05);
 const province = PROVINCES.find(p => p.value === answers.province)?.label ?? String(answers.province ?? '');
 const property = await api.createProperty({
  address: [answers.street, answers.unit].filter(Boolean).join(', '),
  city: `${String(answers.municipality ?? '')} (${province})`,
  region: 'Emilia-Romagna',
  ...(typeof answers.floorArea === 'number' ? { floorAreaM2: answers.floorArea } : {}),
 });
 const c = await api.createCase(property.id);
 const notices = await api.getNotices();
 await api.giveConsent(c.id, notices.evidence_processing);
 const files = Object.entries(photos).flatMap(([q, list]) => (list ?? []).map(p => ({ q, p })));
 let i = 0;
 for (const { q, p } of files) {
  onProgress(`Carico foto e documenti (${i + 1}/${files.length})`, 0.1 + (0.8 * i) / Math.max(1, files.length));
  await api.uploadEvidence(c.id, KIND[q] ?? 'document', { uri: p.uri, name: p.name, mimeType: p.mimeType });
  i++;
 }
 onProgress('Invio ai certificatori', 0.95);
 await api.submitCase(c.id);
 onProgress('Fatto', 1);
 return { caseId: c.id };
}
