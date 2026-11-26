/** First operational encrypted-media path: local demo certificate delivery.
 * No change to remote delivery or survey media. The app holds a single media
 * operation lease, prevents cleanup during it, and supplies a session guard.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { APE_CODE, canDeliver } from '../job';
import { canViewDraft, enqueueMediaCleanup, saveStateNow, type AppState } from './drafts';
import { sealNativeMedia, withOpenedNativeMedia } from './media-gateway';
import { findQuestion, isVisible, type PhotoRef } from './questions';
import { VIDEO_MAX_CLIPS, videoBudgetSeconds } from './video';

type Source = { uri: string; name: string; mimeType: string };
type Access = {
 latest: () => AppState | null;
 guard: () => void;
 publish: (next: AppState, committed: boolean) => boolean | void;
};
const safe = /^[a-zA-Z0-9_-]{1,128}$/;
const name = () => Date.now() + '-' + Math.random().toString(36).slice(2, 12);
const folder = (draftId: string) => new Directory(Paths.document, 'ape', 'media', draftId);

export async function deliverEncryptedDemoApe(access: Access, draftId: string, code: string,
 energyClass: string, source: Source, seal = sealNativeMedia): Promise<void> {
 access.guard();
 const initial = access.latest()?.drafts.find(d => d.id === draftId);
 if (!safe.test(draftId) || !initial || !canViewDraft(initial, null, true) ||
     !canDeliver(initial.job) || !APE_CODE.test(code) || !energyClass ||
     source.mimeType !== 'application/pdf') throw new Error('Consegna dimostrativa non disponibile');
 const initialJob = initial.job;
 const current = () => {
  access.guard();
  const state = access.latest();
  const draft = state?.drafts.find(d => d.id === draftId);
  if (!state || !draft || !canViewDraft(draft, null, true) ||
      draft.job !== initialJob || !canDeliver(draft.job)) throw new Error('Incarico modificato durante la consegna');
  return { state, draft };
 };
 const dir = folder(draftId);
 let destination: File | undefined;
 for (let i = 0; i < 8; i++) {
  const f = new File(dir, name() + '.apem');
  const { state } = current();
  const reserved = enqueueMediaCleanup(state, draftId, f.uri);
  const used = state.drafts.some(d => d.job?.ape?.pdf?.uri === f.uri ||
   Object.values(d.photos).some(list => list?.some(p => p.uri === f.uri)));
  if (!f.exists && !used && reserved && reserved !== state) { destination = f; break; }
 }
 if (!destination) throw new Error('Destinazione locale non disponibile');
 const stage = destination;
 const filename = stage.uri.slice(stage.uri.lastIndexOf('/') + 1);
 let reserved = false;
 await seal({
  input: new File(source.uri), stage, draftId, filename,
  guard: () => { current(); },
  hasEncryptedEvidence: () => {
   const { state } = current();
   return state.drafts.some(d => d.job?.ape?.pdf?.uri.endsWith('.apem') ||
    Object.values(d.photos).some(list => list?.some(p => p.uri.endsWith('.apem'))));
  },
  reserve: () => {
   const { state } = current();
   const queued = enqueueMediaCleanup(state, draftId, stage.uri);
   if (!queued || queued === state || stage.exists) throw new Error('Destinazione già riservata');
   saveStateNow(queued);
   access.publish(queued, true);
   reserved = true;
   if (!dir.exists) dir.create({ intermediates: true });
  },
 });
 const { state, draft } = current();
 if (!reserved || !stage.exists || !state.pendingMediaCleanup?.some(t => t.draftId === draftId && t.filename === filename))
  throw new Error('Prenotazione allegato non confermata');
 const pdf: PhotoRef = { uri: stage.uri, name: source.name, mimeType: 'application/pdf', takenAt: new Date().toISOString() };
 const nextDraft = { ...draft, updatedAt: new Date().toISOString(),
  job: { ...draft.job!, status: 'consegnata' as const, ape: { code, energyClass, pdf, deliveredAt: new Date().toISOString() } } };
 const { pendingMediaCleanup, ...rest } = state;
 const remaining = pendingMediaCleanup.filter(t => !(t.draftId === draftId && t.filename === filename));
 const next: AppState = { ...rest, drafts: state.drafts.map(d => d.id === draftId ? nextDraft : d),
  ...(remaining.length ? { pendingMediaCleanup: remaining } : {}) };
 // A partial snapshot commit may already reference the encrypted stage. Keep
 // the intended state for retry; do not unlink or report a successful delivery.
 try { saveStateNow(next); }
 catch {
  if (access.publish(next, false) !== true) throw new Error('Consegna non confermata: riprova il salvataggio locale.');
  return;
 }
 access.publish(next, true);
}

/** Plaintext stays in the dedicated private cache only during a bounded
 * consumer. Both the temporary file and its journal are recovered on startup. */
async function withOpenedMedia<T>(input: File, draftId: string, filename: string,
 extension: string, guard: () => void, use: (file: File) => Promise<T>): Promise<T> {
 const { preparePrivateMediaCache } = await import('./media-native-storage');
 guard();
 preparePrivateMediaCache();
 const cache = new Directory(Paths.cache, 'ape-media-open');
 const temporaryName = name() + '.' + extension;
 const stage = new File(cache, temporaryName);
 const journal = new File(cache, temporaryName + '.pending');
 if (stage.exists || journal.exists) throw new Error('Cache attestato non disponibile');
 let journalOwned = false;
 try {
  return await withOpenedNativeMedia({
   input, stage, draftId, filename, guard, hasEncryptedEvidence: () => true,
   reserve: () => { guard(); journal.create({ overwrite: false }); journalOwned = true;
    if (!journal.exists) throw new Error('Prenotazione cache non confermata'); },
  }, temporaryName, async file => { guard(); const value = await use(file); guard(); return value; });
 } finally {
  if (journalOwned && !stage.exists && journal.exists) journal.delete();
 }
}

/** Authenticate the entire new envelope and compare all bytes to the legacy
 * source before committing a replacement reference. Bounded native reads. */
async function verifyMigratedPdf(source: File, sealed: File, draftId: string, filename: string,
 guard: () => void): Promise<void> {
 await withOpenedMedia(sealed, draftId, filename, 'pdf', guard, async clear => {
  const a = source.open();
  try {
   const b = clear.open();
   try {
    const size = a.size;
    if (size === null || !Number.isSafeInteger(size) || size <= 0 || b.size !== size)
     throw new Error('Verifica migrazione attestato non riuscita');
    for (let offset = 0; offset < size;) {
     guard();
     const n = Math.min(1024 * 1024, size - offset);
     const x = await a.readBytes(n), y = await b.readBytes(n);
     guard();
     if (x.length !== n || y.length !== n) throw new Error('Lettura migrazione incompleta');
     for (let i = 0; i < n; i++) if (x[i] !== y[i]) throw new Error('Verifica migrazione attestato non riuscita');
     offset += n;
    }
    if (a.size !== size || b.size !== size) throw new Error('Dimensione attestato modificata');
   } finally { await b.close(); }
  } finally { await a.close(); }
 });
}

/** On-demand migration of a currently authorized local demo certificate.
 * Never delete the old source here. A verified replacement and its old-file
 * cleanup intent must be committed together; retryMediaCleanup re-checkpoints
 * both snapshots before unlinking any unreferenced old file.
 * An already encrypted reference never falls back to the legacy source. */
export async function migrateLocalDemoApe(access: Access, draftId: string, uri: string,
 seal = sealNativeMedia, verify = verifyMigratedPdf): Promise<string> {
 access.guard();
 const original = access.latest()?.drafts.find(d => d.id === draftId)?.job?.ape?.pdf;
 if (!safe.test(draftId) || !original || original.uri !== uri || original.mimeType !== 'application/pdf')
  throw new Error('Attestato non disponibile');
 const current = () => {
  access.guard();
  const state = access.latest();
  const draft = state?.drafts.find(d => d.id === draftId);
  if (!state || !draft || !canViewDraft(draft, null, true) || draft.job?.ape?.pdf !== original)
   throw new Error('Attestato modificato durante la migrazione');
  return { state, draft };
 };
 current();
 const oldName = uri.slice(uri.lastIndexOf('/') + 1);
 if (!/^[a-zA-Z0-9_-]{1,128}\.(pdf|apem)$/.test(oldName)) throw new Error('Percorso attestato non valido');
 const dir = folder(draftId);
 const source = new File(dir, oldName);
 if (source.uri !== uri || !source.exists) throw new Error('Attestato non disponibile');
 if (oldName.endsWith('.apem')) return uri;
 let destination: File | undefined;
 for (let i = 0; i < 8; i++) {
  const candidate = new File(dir, name() + '.apem');
  const { state } = current();
  const queued = enqueueMediaCleanup(state, draftId, candidate.uri);
  const used = state.drafts.some(d => d.job?.ape?.pdf?.uri === candidate.uri ||
   Object.values(d.photos).some(list => list?.some(p => p.uri === candidate.uri)));
  if (!candidate.exists && !used && queued && queued !== state) { destination = candidate; break; }
 }
 if (!destination) throw new Error('Destinazione migrazione non disponibile');
 const stage = destination, filename = stage.uri.slice(stage.uri.lastIndexOf('/') + 1);
 const guard = () => { current(); };
 let reserved = false;
 await seal({
  input: source, stage, draftId, filename, guard,
  hasEncryptedEvidence: () => {
   const { state } = current();
   return state.drafts.some(d => d.job?.ape?.pdf?.uri.endsWith('.apem') ||
    Object.values(d.photos).some(list => list?.some(p => p.uri.endsWith('.apem'))));
  },
  reserve: () => {
   const { state } = current();
   const queued = enqueueMediaCleanup(state, draftId, stage.uri);
   if (!queued || queued === state || stage.exists) throw new Error('Destinazione già riservata');
   saveStateNow(queued);
   access.publish(queued, true);
   reserved = true;
  },
 });
 guard();
 if (!reserved || !stage.exists) throw new Error('Migrazione non confermata');
 await verify(source, stage, draftId, filename, guard);
 const { state, draft } = current();
 if (!stage.exists || !state.pendingMediaCleanup?.some(t => t.draftId === draftId && t.filename === filename))
  throw new Error('Prenotazione migrazione non confermata');
 const { pendingMediaCleanup, ...rest } = state;
 const remaining = pendingMediaCleanup.filter(t => !(t.draftId === draftId && t.filename === filename));
 const nextDraft = { ...draft, job: { ...draft.job!, ape: { ...draft.job!.ape!, pdf: { ...original, uri: stage.uri } } } };
 const logical: AppState = { ...rest, drafts: state.drafts.map(d => d.id === draftId ? nextDraft : d),
  ...(remaining.length ? { pendingMediaCleanup: remaining } : {}) };
 const next = enqueueMediaCleanup(logical, draftId, uri);
 if (!next) throw new Error('Pulizia attestato non registrabile');
 try { saveStateNow(next); }
 catch {
  if (access.publish(next, false) !== true) throw new Error('Migrazione non confermata: riprova il salvataggio locale.');
  return stage.uri;
 }
 access.publish(next, true);
 return stage.uri;
}

/** Only the current authenticated manifest may authorize the PDF. New and
 * migrated certificates are opened only through the authenticated gateway. */
export async function shareLocalApe(access: Pick<Access, 'latest' | 'guard'>,
 draftId: string, uri: string, share: (uri: string) => Promise<void>): Promise<void> {
 const guard = () => {
  access.guard();
  const draft = access.latest()?.drafts.find(d => d.id === draftId);
  if (!safe.test(draftId) || !draft || !canViewDraft(draft, null, true) ||
      draft.job?.ape?.pdf?.uri !== uri || draft.job.ape.pdf.mimeType !== 'application/pdf')
   throw new Error('Attestato non disponibile');
 };
 guard();
 const filename = uri.slice(uri.lastIndexOf('/') + 1);
 if (!/^[a-zA-Z0-9_-]{1,128}\.apem$/.test(filename)) throw new Error('Percorso attestato non valido');
 const input = new File(folder(draftId), filename);
 if (input.uri !== uri || !input.exists) throw new Error('Attestato non disponibile');
 await withOpenedMedia(input, draftId, filename, 'pdf', guard, async file => { guard(); await share(file.uri); guard(); });
}

/** A current manifest reference is required throughout a bounded survey-media
 * consumer. The durable URI remains the checkpoint identity, never the cache URI.
 * Legacy app-owned files remain readable until their separate migration.
 */
export async function withSurveyMedia<T>(access: Pick<Access, 'latest' | 'guard'>,
 draftId: string, questionId: string, photo: PhotoRef, use: (uri: string) => Promise<T>): Promise<T> {
 const guard = () => {
  access.guard();
  const draft = access.latest()?.drafts.find(d => d.id === draftId);
  if (!safe.test(draftId) || !safe.test(questionId) ||
      !draft?.photos[questionId]?.some(p => p.uri === photo.uri && p.mimeType === photo.mimeType && p.name === photo.name))
   throw new Error('Allegato non disponibile');
 };
 guard();
 const filename = photo.uri.slice(photo.uri.lastIndexOf('/') + 1);
 if (!/^[a-zA-Z0-9_-]{1,128}\.(apem|jpg|jpeg|png|heic|heif|pdf|mp4|mov)$/.test(filename))
  throw new Error('Percorso allegato non valido');
 const input = new File(folder(draftId), filename);
 if (input.uri !== photo.uri || !input.exists) throw new Error('Allegato non disponibile');
 if (!filename.endsWith('.apem')) {
  const value = await use(input.uri);
  guard();
  return value;
 }
 const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/heif': 'heif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'application/pdf': 'pdf',
 };
 const extension = extensions[photo.mimeType];
 if (!extension) throw new Error('Tipo allegato non supportato');
 return withOpenedMedia(input, draftId, filename, extension, guard, async file => use(file.uri));
}

/** Journaled capture transaction; activate only after preview consumers support
 * encrypted references. Picker-owned sources are never unlinked here. */
export async function captureEncryptedSurveyMedia(access: Access, draftId: string, questionId: string,
 source: Source & Pick<PhotoRef, 'width' | 'height' | 'durationSec'>, seal = sealNativeMedia): Promise<PhotoRef> {
 const current = () => {
  access.guard();
  const state = access.latest();
  const draft = state?.drafts.find(d => d.id === draftId);
  const q = findQuestion(questionId);
  if (!safe.test(draftId) || !safe.test(questionId) || !state || !draft || !q ||
      !isVisible(q, draft.answers) || draft.status !== 'bozza') throw new Error('Richiesta modificata durante acquisizione');
  const list = draft.photos[questionId] ?? [];
  if (q.kind === 'photo') {
   if (list.length >= (q.max ?? 3) || !(/^image\/(jpeg|png|heic|heif)$/.test(source.mimeType) ||
       (q.allowDocuments && source.mimeType === 'application/pdf'))) throw new Error('Allegato non consentito');
  } else if (q.kind === 'video') {
   const duration = source.durationSec;
   const used = list.reduce((sum, p) => sum + (p.durationSec ?? 0), 0);
   if (!/^video\/(mp4|quicktime)$/.test(source.mimeType) || duration === undefined || !Number.isFinite(duration) ||
       duration <= 0 || list.length >= VIDEO_MAX_CLIPS || used + duration > videoBudgetSeconds(draft.answers) + 2)
    throw new Error('Video non consentito');
  } else throw new Error('Domanda non compatibile con allegati');
  return { state, draft, list };
 };
 current();
 const dir = folder(draftId);
 let stage: File | undefined;
 for (let i = 0; i < 8; i++) {
  const f = new File(dir, name() + '.apem');
  const { state } = current();
  const queued = enqueueMediaCleanup(state, draftId, f.uri);
  if (!f.exists && queued && queued !== state && !state.drafts.some(d => d.job?.ape?.pdf?.uri === f.uri ||
     Object.values(d.photos).some(list => list?.some(p => p.uri === f.uri)))) { stage = f; break; }
 }
 if (!stage) throw new Error('Destinazione locale non disponibile');
 const destination = stage;
 const filename = destination.uri.slice(destination.uri.lastIndexOf('/') + 1);
 let reserved = false;
 await seal({ input: new File(source.uri), stage: destination, draftId, filename,
  guard: () => { current(); },
  hasEncryptedEvidence: () => current().state.drafts.some(d => d.job?.ape?.pdf?.uri.endsWith('.apem') ||
   Object.values(d.photos).some(list => list?.some(p => p.uri.endsWith('.apem')))),
  reserve: () => {
   const { state } = current();
   const queued = enqueueMediaCleanup(state, draftId, destination.uri);
   if (!queued || queued === state || destination.exists) throw new Error('Destinazione già riservata');
   saveStateNow(queued); access.publish(queued, true); reserved = true;
   if (!dir.exists) dir.create({ intermediates: true });
  },
 });
 const { state, draft, list } = current();
 if (!reserved || !destination.exists || !state.pendingMediaCleanup?.some(t => t.draftId === draftId && t.filename === filename))
  throw new Error('Prenotazione allegato non confermata');
 const ref: PhotoRef = { uri: destination.uri, name: source.name, mimeType: source.mimeType, takenAt: new Date().toISOString(),
  ...(source.width ? { width: source.width } : {}), ...(source.height ? { height: source.height } : {}),
  ...(source.durationSec ? { durationSec: source.durationSec } : {}) };
 const { pendingMediaCleanup, ...rest } = state;
 const remaining = pendingMediaCleanup.filter(t => !(t.draftId === draftId && t.filename === filename));
 const next: AppState = { ...rest, drafts: state.drafts.map(d => d.id === draftId ? {
  ...draft, updatedAt: new Date().toISOString(), photos: { ...draft.photos, [questionId]: [...list, ref] },
 } : d), ...(remaining.length ? { pendingMediaCleanup: remaining } : {}) };
 try { saveStateNow(next); }
 catch { if (access.publish(next, false) !== true) throw new Error('Acquisizione non confermata: riprova il salvataggio locale.'); return ref; }
 access.publish(next, true);
 return ref;
}
