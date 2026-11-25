/** On-device persistence of requests (local-first: the app works without a server). */
import { Directory, File, Paths } from 'expo-file-system';
import type { Answers, PhotoRef, Photos } from './questions';
import type { ProRegistration } from '../pro/registration';
import type { Job } from '../job';

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
export type AppState = { version: 1; drafts: Draft[]; pro?: ProProfile; proProfiles?: ScopedProProfile[] };

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
export function canViewDraft(d: Draft, owner: DraftOwner | null): boolean {
 const matches = (bound: DraftOwner) => owner !== null && bound.subject === owner.subject && bound.organizationId === owner.organizationId;
 if (d.localOwner && !matches(d.localOwner)) return false;
 if (d.remoteOwner) return matches(d.remoteOwner);
 if (d.remoteCreationKey || d.remoteCaseId || d.remotePropertyId || Object.keys(d.videoUploads ?? {}).length || d.uploaded?.length) return false;
 return true;
}

const EMPTY: AppState = { version: 1, drafts: [] };
const dir = () => new Directory(Paths.document, 'ape');
const stateFile = () => new File(dir(), 'state.json');
const backupFile = () => new File(dir(), 'state.bak.json');

type SnapshotRead = { kind: 'missing' | 'invalid' } | { kind: 'valid'; state: AppState; generation: number };

// Validate persisted shape before exposing a snapshot to the UI or account filters.
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === 'string');
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const safeId = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9_-]+$/.test(v);
const optional = (v: unknown, check: (x: unknown) => boolean) => v === undefined || check(v);
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
  optional(v.ape, x => record(x) && nonempty(x.code) && nonempty(x.energyClass) && nonempty(x.deliveredAt) &&
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
 return optional(v.pro, profileShape) && optional(v.proProfiles, x => Array.isArray(x) &&
  x.every(p => record(p) && (p.owner === null || ownerShape(p.owner, true)) && profileShape(p.profile)));
}

// Storage-only metadata; legacy snapshots without it are generation zero.
function parseSnapshot(data: string): SnapshotRead {
 const parsed: unknown = JSON.parse(data);
 if (!snapshotShape(parsed)) return { kind: 'invalid' };
 const { storageGeneration, ...state } = parsed as AppState & { storageGeneration?: unknown };
 if (storageGeneration !== undefined &&
     (typeof storageGeneration !== 'number' || !Number.isSafeInteger(storageGeneration) || storageGeneration < 1)) {
  return { kind: 'invalid' };
 }
 return { kind: 'valid', state, generation: typeof storageGeneration === 'number' ? storageGeneration : 0 };
}

async function read(f: File): Promise<SnapshotRead> {
 try {
  if (!f.exists) return { kind: 'missing' };
  return parseSnapshot(await f.text());
 } catch {
  return { kind: 'invalid' };
 }
}

function readSync(f: File): SnapshotRead {
 try {
  if (!f.exists) return { kind: 'missing' };
  return parseSnapshot(f.textSync());
 } catch {
  return { kind: 'invalid' };
 }
}

/** A missing or unreadable installation is not interchangeable with a new one.
 * Never silently initialize empty state over existing but unrecoverable snapshots.
 * Staging files are evidence of an interrupted write, not committed snapshots.
 */
export async function loadState(): Promise<AppState> {
 const primary = await read(stateFile());
 const d = dir();
 const tmp = new File(d, 'state.tmp.json');
 const bakTmp = new File(d, 'state.bak.tmp.json');
 const backup = await read(backupFile());
 if (primary.kind === 'valid') {
  if (backup.kind === 'valid') {
   // Only the committed copies participate in generation ordering.
   if (backup.generation > primary.generation) return backup.state;
   // Older versions did not record a generation. Recognize the narrow
   // interrupted-commit case from the matching primary staging file.
   if (primary.generation === 0 && backup.generation === 0 && tmp.exists && !bakTmp.exists) {
    const staged = await read(tmp);
    if (staged.kind === 'valid' && staged.generation === 0 &&
        JSON.stringify(backup.state) === JSON.stringify(staged.state)) return backup.state;
   }
  }
  return primary.state;
 }
 if (backup.kind === 'valid') return backup.state;
 if (primary.kind === 'invalid' || backup.kind === 'invalid' ||
     tmp.exists || bakTmp.exists ||
     new Directory(d, 'media').exists) {
  throw new Error('Local snapshots could not be recovered');
 }
 return EMPTY;
}

/** Commit both copies of the same snapshot. A previous snapshot may contain erased personal data.
 * Prepare both files before replacing either copy; replace the backup first so a missing primary
 * after an interrupted replacement can recover the new snapshot, not the deleted draft.
 * All file operations here are synchronous, so an immediate deletion can commit before updating UI.
 */
export function saveStateNow(s: AppState): void {
 // Validate the serialized representation before touching either committed copy.
 // A runtime-invalid state must not overwrite the last recoverable snapshot.
 const serialized = JSON.stringify(s);
 const parsed: unknown = JSON.parse(serialized);
 if (!snapshotShape(parsed)) throw new Error('Invalid local snapshot');
 // Read committed generations before touching staging files. This preserves
 // ordering even if another save is interrupted after an earlier recovery.
 const current = [readSync(stateFile()), readSync(backupFile())];
 const generation = Math.max(0, ...current.map(r => r.kind === 'valid' ? r.generation : 0)) + 1;
 if (!Number.isSafeInteger(generation)) throw new Error('Local snapshot generation exhausted');
 const data = JSON.stringify({ ...parsed, storageGeneration: generation });
 const d = dir();
 if (!d.exists) d.create({ intermediates: true });
 const tmp = new File(d, 'state.tmp.json');
 const bakTmp = new File(d, 'state.bak.tmp.json');
 for (const staging of [tmp, bakTmp]) {
  if (staging.exists) staging.delete();
  staging.create();
  staging.write(data);
 }
 const backup = backupFile();
 if (backup.exists) backup.delete();
 bakTmp.move(backupFile());
 const primary = stateFile();
 if (primary.exists) primary.delete();
 tmp.move(stateFile());
}

export async function saveState(s: AppState): Promise<void> {
 saveStateNow(s);
}

/** Copies a picked image/PDF into app storage so it survives cache cleanup. */
export function persistPhoto(draftId: string, src: { uri: string; name: string; mimeType: string; width?: number; height?: number; durationSec?: number }): PhotoRef {
 if (!safeId(draftId)) throw new Error('Invalid draft identifier');
 const d = new Directory(dir(), 'media', draftId);
 if (!d.exists) d.create({ intermediates: true });
 const ext = src.mimeType.startsWith('video/') ? (src.mimeType === 'video/quicktime' ? 'mov' : 'mp4') : src.mimeType === 'application/pdf' ? 'pdf' : src.mimeType === 'image/png' ? 'png' : src.mimeType === 'image/heic' ? 'heic' : 'jpg';
 const dest = new File(d, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
 new File(src.uri).copy(dest);
 return { uri: dest.uri, name: src.name, mimeType: src.mimeType, takenAt: new Date().toISOString(), ...(src.width ? { width: src.width } : {}), ...(src.height ? { height: src.height } : {}), ...(src.durationSec ? { durationSec: src.durationSec } : {}) };
}

export function deleteMedia(draftId: string): void {
 if (!safeId(draftId)) return;
 try { const d = new Directory(dir(), 'media', draftId); if (d.exists) d.delete(); } catch { /* best effort */ }
}

/** Use the current snapshot, not a stale UI callback, and preserve other references to the same file. */
export function removeDraftPhoto(draft: Draft, questionId: string, uri: string): { draft: Draft; removed: PhotoRef; unreferenced: boolean } | null {
 const list = draft.photos[questionId] ?? [];
 const removed = list.find(p => p.uri === uri);
 if (!removed) return null;
 const photos = { ...draft.photos, [questionId]: list.filter(p => p.uri !== uri) };
 const unreferenced = !Object.values(photos).some(items => (items ?? []).some(p => p.uri === uri));
 return { draft: { ...draft, photos, updatedAt: new Date().toISOString() }, removed, unreferenced };
}

/** Only unlink files in this draft's own media directory. Never follow an arbitrary saved URI. */
export function deleteDraftPhotoFile(draftId: string, p: PhotoRef): void {
 if (!/^[a-zA-Z0-9_-]+$/.test(draftId)) return;
 try {
  const d = new Directory(dir(), 'media', draftId);
  const prefix = d.uri.replace(/\/$/, '') + '/';
  if (!p.uri.startsWith(prefix)) return;
  const filename = p.uri.slice(prefix.length);
  if (!/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(filename)) return;
  const f = new File(d, filename);
  if (f.exists) f.delete();
 } catch { /* best effort: orphan cleanup remains separate */ }
}

export function newDraft(): Draft {
 const now = new Date().toISOString();
 return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now, answers: {}, photos: {}, status: 'bozza' };
}
