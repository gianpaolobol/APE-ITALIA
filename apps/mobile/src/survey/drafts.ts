/** On-device persistence of requests (local-first: the app works without a server). */
import { Directory, File, Paths } from 'expo-file-system';
import { activateArchive, archiveIsActive, isEncryptedSnapshot, loadArchiveKey, openSnapshot, requireActiveArchive, sealSnapshot } from './snapshot-crypto';
import type { Answers, PhotoRef, Photos } from './questions';
import type { ProRegistration } from '../pro/registration';
import { APE_CODE, canDeliver, type Job } from '../job';

export type Draft = {
 id: string;
 createdAt: string;
 updatedAt: string;
 answers: Answers;
 photos: Photos;
 status: 'bozza' | 'pronta' | 'inviata';
 sentAt?: string;
 /** Server case already created (retries reuse it instead of creating a new one). */
 remoteCaseId?: string;
 remoteCreationKey?: string;
 remotePropertyId?: string;
 remoteOwner?: { subject: string; organizationId: string };
 /** Account that created the local draft, when known. */
 localOwner?: { subject: string; organizationId: string | null };
 videoUploads?: Record<string, string>;
 /** Local photo URIs already uploaded to remoteCaseId. */
 uploaded?: string[];
 /** Certifier side (local demo until the server is online). */
 job?: Job;
};

export type ProProfile = { data: ProRegistration; submittedAt: string; status: 'in_verifica' | 'inviata_al_server' };
export type DraftOwner = { subject: string; organizationId: string | null };
type ScopedProProfile = { owner: DraftOwner | null; profile: ProProfile };
// Legacy pro is retained for recovery, but never attributed to an arbitrary account.
type MediaCleanupTask = { draftId: string; filename?: string };
export type AppState = { version: 1; drafts: Draft[]; pro?: ProProfile; proProfiles?: ScopedProProfile[]; pendingMediaCleanup?: MediaCleanupTask[] };

export function sameOwner(a: DraftOwner | null, b: DraftOwner | null): boolean {
 return a === null ? b === null : b !== null && a.subject === b.subject && a.organizationId === b.organizationId;
}

/** Anonymous profiles are only available in explicit offline demo mode. */
export function visiblePro(state: AppState, owner: DraftOwner | null, demo: boolean): ProProfile | undefined {
 if (!owner && !demo) return undefined;
 return state.proProfiles?.find(p => sameOwner(p.owner, owner))?.profile;
}

export function storePro(state: AppState, owner: DraftOwner | null, demo: boolean, profile: ProProfile): AppState {
 if (!owner && !demo) return state;
 // Store only the scope, never the session tokens or other account details.
 const scope = owner ? { subject: owner.subject, organizationId: owner.organizationId } : null;
 return { ...state, proProfiles: [...(state.proProfiles ?? []).filter(p => !sameOwner(p.owner, scope)), { owner: scope, profile }] };
}
/** Unattributed legacy remote drafts are quarantined, not assigned to a new account. */
export function canViewDraft(d: Draft, owner: DraftOwner | null, demo = false): boolean {
 const matches = (bound: DraftOwner) => owner !== null && bound.subject === owner.subject && bound.organizationId === owner.organizationId;
 if (d.localOwner && !matches(d.localOwner)) return false;
 if (d.remoteOwner) return matches(d.remoteOwner);
 if (d.remoteCreationKey || d.remoteCaseId || d.remotePropertyId || Object.keys(d.videoUploads ?? {}).length || d.uploaded?.length) return false;
 // Ownerless drafts cannot be attributed to whichever account logs in next.
 return d.localOwner !== undefined ? matches(d.localOwner) : demo && owner === null;
}

const EMPTY: AppState = { version: 1, drafts: [] };
const dir = () => new Directory(Paths.document, 'ape');
const stateFile = () => new File(dir(), 'state.json');
const backupFile = () => new File(dir(), 'state.bak.json');
const encryptionMarker = () => new File(dir(), 'state.encrypted');

type SnapshotRead = { kind: 'missing' | 'invalid' | 'unavailable' } | { kind: 'valid'; state: AppState; generation: number; encrypted: boolean };

// Validate persisted shape before exposing a snapshot to the UI or account filters.
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const safeId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]+$/.test(v);
const optional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v);
const safeFilename = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(v);
const cleanupShape = (v: unknown): boolean => record(v) && safeId(v.draftId) && optional(v.filename, safeFilename);
const ownerShape = (v: unknown, allowNullOrg: boolean): boolean => record(v) && nonempty(v.subject) &&
 (nonempty(v.organizationId) || (allowNullOrg && v.organizationId === null));
const photoShape = (v: unknown): boolean => record(v) && nonempty(v.uri) &&
 typeof v.name === 'string' && nonempty(v.mimeType) && nonempty(v.takenAt) &&
 [v.width, v.height, v.durationSec].every(x => optional(x, finite));
const answerShape = (v: unknown): boolean => typeof v === 'string' || typeof v === 'boolean' || finite(v) || strings(v);
const profileShape = (v: unknown): boolean => {
 if (!record(v) || !record(v.data) || !nonempty(v.submittedAt) ||
     (v.status !== 'in_verifica' && v.status !== 'inviata_al_server')) return false;
 const d = v.data;
 return ['firstName', 'lastName', 'email', 'phone', 'vatNumber', 'taxCode', 'profession', 'professionalOrder',
  'orderNumber', 'region', 'saceNumber'].every(k => typeof d[k] === 'string') &&
  optional(d.pec, x => typeof x === 'string') && strings(d.provinces) && finite(d.maxMonthlyJobs) &&
  typeof d.acceptsTerms === 'boolean' && typeof d.declaresAccreditation === 'boolean';
};
const jobShape = (v: unknown): boolean => {
 if (!record(v) || !['nuova', 'accettata', 'rifiutata', 'consegnata'].some(s => s === v.status) ||
     !record(v.certifier) || typeof v.certifier.name !== 'string' || typeof v.certifier.sace !== 'string') return false;
 return optional(v.acceptedAt, nonempty) &&
  optional(v.call, x => record(x) && nonempty(x.at) && nonempty(x.url)) &&
  optional(v.visit, x => record(x) && nonempty(x.at)) &&
  optional(v.verbale, x => record(x) && ['date', 'start', 'end', 'attendees', 'notes', 'ownerName', 'savedAt']
   .every(k => typeof x[k] === 'string') && strings(x.checks) &&
   typeof x.ownerConfirmed === 'boolean' && typeof x.declaration === 'boolean') &&
  optional(v.ape, x => record(x) && nonempty(x.code) && nonempty(x.energyClass) &&
   (nonempty(x.deliveredAt) || (x.deliveredAt === '' && v.status === 'accettata' && nonempty(x.depositedAt))) &&
   optional(x.depositedAt, nonempty) && optional(x.pdf, photoShape));
};
function draftShape(v: unknown): v is Draft {
 return record(v) && safeId(v.id) && nonempty(v.createdAt) && nonempty(v.updatedAt) &&
  ['bozza', 'pronta', 'inviata'].some(s => s === v.status) &&
  record(v.answers) && Object.values(v.answers).every(answerShape) &&
  record(v.photos) && Object.values(v.photos).every(x => Array.isArray(x) && x.every(photoShape)) &&
  [v.sentAt, v.remoteCaseId, v.remoteCreationKey, v.remotePropertyId].every(x => optional(x, nonempty)) &&
  optional(v.localOwner, x => ownerShape(x, true)) && optional(v.remoteOwner, x => ownerShape(x, false)) &&
  optional(v.uploaded, strings) && optional(v.videoUploads, x => record(x) && Object.values(x).every(nonempty)) &&
  optional(v.job, jobShape);
}
function snapshotShape(v: unknown): v is AppState {
 if (!record(v) || v.version !== 1 || !Array.isArray(v.drafts) || !v.drafts.every(draftShape)) return false;
 if (new Set(v.drafts.map(d => d.id)).size !== v.drafts.length) return false;
 return optional(v.pendingMediaCleanup, x => Array.isArray(x) && x.every(cleanupShape)) &&
  optional(v.pro, profileShape) && optional(v.proProfiles, x => Array.isArray(x) &&
  x.every(p => record(p) && (p.owner === null || ownerShape(p.owner, true)) && profileShape(p.profile)));
}

// Storage-only metadata; legacy snapshots without it are generation zero.
function parseSnapshot(data: string, staging = false): SnapshotRead {
 let decoded: ReturnType<typeof openSnapshot>;
 try { decoded = openSnapshot(data); } catch {
  // During migration never recover unauthenticated legacy data after a
  // committed encrypted copy failed authentication. Staging is not committed.
  return { kind: !staging && !archiveIsActive() && isEncryptedSnapshot(data) ? 'unavailable' : 'invalid' };
 }
 let parsed: unknown;
 try { parsed = JSON.parse(decoded.text); } catch { return { kind: 'invalid' }; }
 if (!snapshotShape(parsed)) return { kind: 'invalid' };
 const { storageGeneration, ...state } = parsed as AppState & { storageGeneration?: unknown };
 if (storageGeneration !== undefined &&
     (typeof storageGeneration !== 'number' || !Number.isSafeInteger(storageGeneration) || storageGeneration < 1)) {
  return { kind: 'invalid' };
 }
 return { kind: 'valid', state, generation: typeof storageGeneration === 'number' ? storageGeneration : 0, encrypted: decoded.encrypted };
}

async function read(f: File, staging = false): Promise<SnapshotRead> {
 try {
  if (!f.exists) return { kind: 'missing' };
  return parseSnapshot(await f.text(), staging);
 } catch {
  return { kind: 'unavailable' };
 }
}

function readSync(f: File, staging = false): SnapshotRead {
 try {
  if (!f.exists) return { kind: 'missing' };
  return parseSnapshot(f.textSync(), staging);
 } catch {
  return { kind: 'unavailable' };
 }
}

/** A missing or unreadable installation is not interchangeable with a new one.
 * Never silently initialize empty state over existing but unrecoverable snapshots.
 * Staging files are evidence of an interrupted write, not committed snapshots.
 */
async function loadStateRaw(): Promise<AppState> {
 const primary = await read(stateFile());
 const d = dir();
 const tmp = new File(d, 'state.tmp.json');
 const bakTmp = new File(d, 'state.bak.tmp.json');
 const backup = await read(backupFile());
 // An I/O error (e.g. protected files while locked) is not proven corruption.
 // A temporarily unreadable copy could be the newest committed generation.
 if (primary.kind === 'unavailable' || backup.kind === 'unavailable') {
  throw new Error('Local snapshots temporarily unavailable');
 }
 if (primary.kind === 'valid') {
  if (backup.kind === 'valid') {
   // Only the committed copies participate in generation ordering.
   if (backup.encrypted !== primary.encrypted) return backup.encrypted ? backup.state : primary.state;
   if (backup.generation > primary.generation) return backup.state;
   // Older versions did not record a generation. Recognize the narrow
   // interrupted-commit case from the matching primary staging file.
   if (primary.generation === 0 && backup.generation === 0 && tmp.exists && !bakTmp.exists) {
    const staged = await read(tmp, true);
    if (staged.kind === 'unavailable') throw new Error('Local snapshots temporarily unavailable');
    if (staged.kind === 'valid' && staged.generation === 0 &&
        JSON.stringify(backup.state) === JSON.stringify(staged.state)) return backup.state;
   }
  }
  return primary.state;
 }
 if (backup.kind === 'valid') return backup.state;
 if (archiveIsActive() || primary.kind === 'invalid' || backup.kind === 'invalid' ||
     tmp.exists || bakTmp.exists ||
     new Directory(d, 'media').exists) {
  throw new Error('Local snapshots could not be recovered');
 }
 return EMPTY;
}

/** An independent marker plus all four snapshot names prevent automatic key
 * replacement if SecureStore is lost. Never mutate a snapshot while probing. */
function hasEncryptedEvidence(): boolean {
 if (encryptionMarker().exists) return true;
 const d = dir();
 return [stateFile(), backupFile(), new File(d, 'state.tmp.json'), new File(d, 'state.bak.tmp.json')]
  .some(f => f.exists && isEncryptedSnapshot(f.textSync()));
}

async function openAndMigrate(): Promise<AppState> {
 const mode = await loadArchiveKey(hasEncryptedEvidence);
 const recovered = await loadStateRaw();
 if (mode === 'pending') {
  // Persist the marker before any encrypted snapshot is written. A crash
  // leaves the same key and pending mode for deterministic retry.
  const d = dir();
  if (!d.exists) d.create({ intermediates: true });
  const marker = encryptionMarker();
  if (!marker.exists) marker.create();
  commitState(recovered);
  const a = readSync(stateFile()), b = readSync(backupFile());
  if (a.kind !== 'valid' || b.kind !== 'valid' || !a.encrypted || !b.encrypted ||
      a.generation !== b.generation || JSON.stringify(a.state) !== JSON.stringify(recovered) ||
      JSON.stringify(b.state) !== JSON.stringify(recovered)) throw new Error('Local archive migration not confirmed');
  await activateArchive();
 }
 return recovered;
}

let opening: Promise<AppState> | undefined;
export function loadState(): Promise<AppState> {
 if (!opening) opening = openAndMigrate().finally(() => { opening = undefined; });
 return opening;
}

/** Commit both copies of the same snapshot. A previous snapshot may contain erased personal data.
 * Prepare both files before replacing either copy; replace the older copy first so a failure
 * cannot erase the sole latest committed snapshot.
 * All file operations here are synchronous, so an immediate deletion can commit before updating UI.
 */
export function saveStateNow(s: AppState): void {
 requireActiveArchive();
 commitState(s);
}

function commitState(s: AppState): void {
 // Validate the serialized representation before touching either committed copy.
 // A runtime-invalid state must not overwrite the last recoverable snapshot.
 const serialized = JSON.stringify(s);
 const parsed: unknown = JSON.parse(serialized);
 if (!snapshotShape(parsed)) throw new Error('Invalid local snapshot');
 // Read committed generations before touching staging files. This preserves
 // ordering even if another save is interrupted after an earlier recovery.
 const previousPrimary = readSync(stateFile()), previousBackup = readSync(backupFile());
 const current = [previousPrimary, previousBackup];
 if (current.some(r => r.kind === 'unavailable')) throw new Error('Local snapshots temporarily unavailable');
 if (!current.some(r => r.kind === 'valid') && (archiveIsActive() || current.some(r => r.kind === 'invalid'))) {
  throw new Error('Local snapshots could not be recovered');
 }
 const preferEncrypted = current.some(r => r.kind === 'valid' && r.encrypted);
 const generation = Math.max(0, ...current.map(r => r.kind === 'valid' && (!preferEncrypted || r.encrypted) ? r.generation : 0)) + 1;
 if (!Number.isSafeInteger(generation)) throw new Error('Local snapshot generation exhausted');
 const data = sealSnapshot(JSON.stringify({ ...parsed, storageGeneration: generation }));
 const d = dir();
 if (!d.exists) d.create({ intermediates: true });
 const tmp = new File(d, 'state.tmp.json');
 const bakTmp = new File(d, 'state.bak.tmp.json');
 const previousStaging = tmp.exists && !bakTmp.exists ? readSync(tmp, true) : null;
 if (previousStaging?.kind === 'unavailable') throw new Error('Local snapshots temporarily unavailable');
 const backupIsNewest = previousBackup.kind === 'valid' &&
  (previousPrimary.kind !== 'valid' || (previousBackup.encrypted && !previousPrimary.encrypted) ||
   (previousBackup.encrypted === previousPrimary.encrypted && (previousBackup.generation > previousPrimary.generation ||
   (previousPrimary.generation === 0 && previousBackup.generation === 0 &&
    previousStaging?.kind === 'valid' && previousStaging.generation === 0 &&
    JSON.stringify(previousBackup.state) === JSON.stringify(previousStaging.state)))));
 for (const staging of [tmp, bakTmp]) {
  if (staging.exists) staging.delete();
  staging.create();
  staging.write(data);
 }
 const replace = (staged: File, target: () => File) => {
  const committed = target();
  if (committed.exists) committed.delete();
  staged.move(target());
 };
 // Never replace the sole newest valid copy first: a failure during the
 // first replacement must still leave the previously committed snapshot.
 if (backupIsNewest) {
  replace(tmp, stateFile);
  replace(bakTmp, backupFile);
 } else {
  replace(bakTmp, backupFile);
  replace(tmp, stateFile);
 }
}

export async function saveState(s: AppState): Promise<void> {
 saveStateNow(s);
}

type PhotoSource = { uri: string; name: string; mimeType: string; width?: number; height?: number; durationSec?: number };

/** Journal an app-owned destination before copying private evidence. On interrupted
 * capture the authenticated cleanup intent survives; once the new reference is
 * committed both snapshots no longer carry that intent. Never delete a file
 * based solely on a failed snapshot write (one copy may already reference it).
 */
type PublishCapture = (next: AppState, committed: boolean) => void | boolean;

function captureDraftMedia(state: AppState, draftId: string, src: PhotoSource,
 update: (draft: Draft, ref: PhotoRef) => Draft, publish: PublishCapture): { ref: PhotoRef; committed: boolean } {
 if (!safeId(draftId)) throw new Error('Invalid draft identifier');
 requireActiveArchive();
 const draft = state.drafts.find(x => x.id === draftId);
 if (!draft) throw new Error('Draft unavailable');
 const d = new Directory(dir(), 'media', draftId);
 const ext = src.mimeType.startsWith('video/') ? (src.mimeType === 'video/quicktime' ? 'mov' : 'mp4') : src.mimeType === 'application/pdf' ? 'pdf' : src.mimeType === 'image/png' ? 'png' : src.mimeType === 'image/heic' ? 'heic' : src.mimeType === 'image/heif' ? 'heif' : 'jpg';
 // A name must be unused on disk, in every draft, and in the cleanup journal.
 // These are identifiers, not cryptographic randomness or an access boundary.
 let chosen: { dest: File; queued: AppState } | undefined;
 for (let i = 0; i < 8; i++) {
  const dest = new File(d, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  if (dest.exists || state.drafts.some(x => mediaUris(x).includes(dest.uri))) continue;
  const queued = enqueueMediaCleanup(state, draftId, dest.uri);
  if (queued && queued !== state) { chosen = { dest, queued }; break; }
 }
 if (!chosen) throw new Error('Local evidence destination unavailable');
 const { dest, queued } = chosen;
 const ref: PhotoRef = { uri: dest.uri, name: src.name, mimeType: src.mimeType, takenAt: new Date().toISOString(), ...(src.width ? { width: src.width } : {}), ...(src.height ? { height: src.height } : {}), ...(src.durationSec ? { durationSec: src.durationSec } : {}) };
 const nextDraft = { ...update(draft, ref), updatedAt: new Date().toISOString() };
 const next = { ...state, drafts: state.drafts.map(x => x.id === draftId ? nextDraft : x) };
 // If reservation fails, no sensitive file is copied. If the copy fails after
 // creating a partial file, leave the durable reservation for cleanup.
 saveStateNow(queued);
 publish(queued, true);
 if (!d.exists) d.create({ intermediates: true });
 new File(src.uri).copy(dest);
 // Keep the intended reference in memory even if writing the second snapshot
 // fails; autosave can retry. On restart, recovery chooses a committed copy.
 try { saveStateNow(next); }
 catch { return { ref, committed: publish(next, false) === true }; }
 publish(next, true);
 return { ref, committed: true };
}

export function addDraftPhoto(state: AppState, draftId: string, questionId: string, src: PhotoSource,
 publish: PublishCapture): PhotoRef {
 if (!safeId(questionId)) throw new Error('Invalid question identifier');
 return captureDraftMedia(state, draftId, src, (d, ref) => ({
  ...d, photos: { ...d.photos, [questionId]: [...(d.photos[questionId] ?? []), ref] },
 }), publish).ref;
}

/** Offline demo only: reserve the PDF in the same journal as other media.
 * Never acknowledge delivery unless both snapshots (or an immediate retry)
 * have been committed. A partial commit keeps the intended reference for retry.
 */
export function deliverDraftApe(state: AppState, draftId: string, code: string, energyClass: string,
 src: PhotoSource, publish: PublishCapture): void {
 const draft = state.drafts.find(d => d.id === draftId);
 if (!draft || !canViewDraft(draft, null, true) || !canDeliver(draft.job) ||
     !APE_CODE.test(code) || !energyClass || src.mimeType !== 'application/pdf') {
  throw new Error('Consegna dimostrativa non disponibile');
 }
 const result = captureDraftMedia(state, draftId, src, (d, ref) => ({
  ...d, job: { ...d.job!, status: 'consegnata', ape: {
   code, energyClass, pdf: ref, deliveredAt: new Date().toISOString(),
  } },
 }), publish);
 if (!result.committed) throw new Error('Consegna non confermata: riprova il salvataggio locale.');
}

/** Local cleanup is separate from committing the logical deletion. */
export type MediaCleanup = 'removed-or-absent' | 'retained-reference' | 'unsafe-path' | 'failed';

function mediaUris(draft: Draft): string[] {
 return [
  ...Object.values(draft.photos).flatMap(items => (items ?? []).map(p => p.uri)),
  ...(draft.job?.ape?.pdf ? [draft.job.ape.pdf.uri] : []),
 ];
}

export function deleteMedia(draftId: string, remaining: AppState): MediaCleanup {
 if (!safeId(draftId)) return 'unsafe-path';
 try {
  const d = new Directory(dir(), 'media', draftId);
  const prefix = d.uri.replace(/\/$/, '') + '/';
  if (remaining.drafts.some(draft => mediaUris(draft).some(uri => uri.startsWith(prefix)))) return 'retained-reference';
  if (d.exists) d.delete();
  return d.exists ? 'failed' : 'removed-or-absent';
 } catch { return 'failed'; }
}

/** Use the current snapshot, not a stale UI callback, and preserve other references to the same file. */
export function removeDraftPhoto(draft: Draft, questionId: string, uri: string): { draft: Draft; removed: PhotoRef; unreferenced: boolean } | null {
 const list = draft.photos[questionId] ?? [];
 const removed = list.find(p => p.uri === uri);
 if (!removed) return null;
 const photos = { ...draft.photos, [questionId]: list.filter(p => p.uri !== uri) };
 const unreferenced = !mediaUris({ ...draft, photos }).includes(uri);
 return { draft: { ...draft, photos, updatedAt: new Date().toISOString() }, removed, unreferenced };
}

/** Only unlink files in this draft's own media directory. Never follow an arbitrary saved URI. */
export function deleteDraftPhotoFile(draftId: string, p: Pick<PhotoRef, 'uri'>, remaining: AppState): MediaCleanup {
 if (!safeId(draftId)) return 'unsafe-path';
 try {
  const d = new Directory(dir(), 'media', draftId);
  const prefix = d.uri.replace(/\/$/, '') + '/';
  if (!p.uri.startsWith(prefix)) return 'unsafe-path';
  const filename = p.uri.slice(prefix.length);
  if (!safeFilename(filename)) return 'unsafe-path';
  if (remaining.drafts.some(draft => mediaUris(draft).includes(p.uri))) return 'retained-reference';
  const f = new File(d, filename);
  if (f.exists) f.delete();
  return f.exists ? 'failed' : 'removed-or-absent';
 } catch { return 'failed'; }
}

/** Record the cleanup intent in the same snapshot as the logical deletion.
 * Only store relative, validated app-owned paths; never persist arbitrary URIs as deletion targets.
 */
export function enqueueMediaCleanup(state: AppState, draftId: string, uri?: string): AppState | null {
 if (!safeId(draftId)) return null;
 let task: MediaCleanupTask = { draftId };
 if (uri !== undefined) {
  const prefix = new Directory(dir(), 'media', draftId).uri.replace(/\/$/, '') + '/';
  if (!uri.startsWith(prefix)) return null;
  const filename = uri.slice(prefix.length);
  if (!safeFilename(filename)) return null;
  task = { draftId, filename };
 }
 const pending = state.pendingMediaCleanup ?? [];
 if (pending.some(p => p.draftId === task.draftId && p.filename === task.filename)) return state;
 return { ...state, pendingMediaCleanup: [...pending, task] };
}

/** Idempotent retry after both snapshots have been committed. If saving the
 * reduced queue fails, the old queue remains retryable; deleting an absent
 * file is harmless. Never remove a still-referenced file or a live draft's directory.
 */
export function retryMediaCleanup(state: AppState): AppState {
 const pending = state.pendingMediaCleanup ?? [];
 if (!pending.length) return state;
 saveStateNow(state);
 const remaining = pending.filter(task => {
  if (!safeId(task.draftId) || (task.filename !== undefined && !safeFilename(task.filename))) return true;
  if (task.filename === undefined && state.drafts.some(d => d.id === task.draftId)) return true;
  const result = task.filename === undefined
   ? deleteMedia(task.draftId, state)
   : deleteDraftPhotoFile(task.draftId, { uri: new File(new Directory(dir(), 'media', task.draftId), task.filename).uri }, state);
  return result !== 'removed-or-absent';
 });
 if (remaining.length === pending.length) return state;
 const { pendingMediaCleanup: _pending, ...rest } = state;
 const next = remaining.length ? { ...rest, pendingMediaCleanup: remaining } : rest;
 saveStateNow(next);
 return next;
}

/** No personal survey is created without an account in server-connected mode. */
export function newScopedDraft(owner: DraftOwner | null, demo: boolean): Draft | null {
 if (owner) return { ...newDraft(), localOwner: { subject: owner.subject, organizationId: owner.organizationId } };
 return demo ? newDraft() : null;
}

export function newDraft(): Draft {
 const now = new Date().toISOString();
 return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now, answers: {}, photos: {}, status: 'bozza' };
}
