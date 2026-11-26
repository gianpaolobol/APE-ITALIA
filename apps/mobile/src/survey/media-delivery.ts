/** First operational encrypted-media path: local demo certificate delivery.
 * No change to remote delivery or survey media. The app holds a single media
 * operation lease, prevents cleanup during it, and supplies a session guard.
 */
import { Directory, File, Paths } from 'expo-file-system';
import { APE_CODE, canDeliver } from '../job';
import { canViewDraft, enqueueMediaCleanup, saveStateNow, type AppState } from './drafts';
import { sealNativeMedia, withOpenedNativeMedia } from './media-gateway';
import type { PhotoRef } from './questions';

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

/** Only the current authenticated manifest may authorize the PDF. Legacy
 * app-owned .pdf references remain readable pending migration. A corrupt
 * .apem never falls back to a plaintext path. */
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
 if (!/^[a-zA-Z0-9_-]{1,128}\.(pdf|apem)$/.test(filename)) throw new Error('Percorso attestato non valido');
 const input = new File(folder(draftId), filename);
 if (input.uri !== uri || !input.exists) throw new Error('Attestato non disponibile');
 if (filename.endsWith('.pdf')) { await share(input.uri); guard(); return; }
 const { preparePrivateMediaCache } = await import('./media-native-storage');
 guard();
 preparePrivateMediaCache();
 const cache = new Directory(Paths.cache, 'ape-media-open');
 const temporaryName = name() + '.pdf';
 const stage = new File(cache, temporaryName);
 const journal = new File(cache, temporaryName + '.pending');
 if (stage.exists || journal.exists) throw new Error('Cache attestato non disponibile');
 let journalOwned = false;
 try {
  await withOpenedNativeMedia({
   input, stage, draftId, filename, guard, hasEncryptedEvidence: () => true,
   reserve: () => { guard(); journal.create({ overwrite: false }); journalOwned = true;
    if (!journal.exists) throw new Error('Prenotazione cache non confermata'); },
  }, temporaryName, async file => { guard(); await share(file.uri); guard(); });
 } finally {
  // If removal of the stage failed, leave the exact intent in the private
  // namespace for unconditional startup recovery. Never delete durable media.
  if (journalOwned && !stage.exists && journal.exists) journal.delete();
 }
}
