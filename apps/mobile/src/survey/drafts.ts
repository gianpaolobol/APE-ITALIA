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

async function read(f: File): Promise<AppState | null> {
 try {
  if (!f.exists) return null;
  const parsed = JSON.parse(await f.text()) as AppState;
  return parsed && parsed.version === 1 && Array.isArray(parsed.drafts) ? parsed : null;
 } catch {
  return null;
 }
}

/** Falls back to the redundant snapshot if the main file is missing or corrupt. */
export async function loadState(): Promise<AppState> {
 return (await read(stateFile())) ?? (await read(backupFile())) ?? EMPTY;
}

/** Commit both copies of the same snapshot. A previous snapshot may contain erased personal data.
 * Prepare both files before replacing either copy; replace the backup first so a missing primary
 * after an interrupted replacement can recover the new snapshot, not the deleted draft.
 * All file operations here are synchronous, so an immediate deletion can commit before updating UI.
 */
export function saveStateNow(s: AppState): void {
 const d = dir();
 if (!d.exists) d.create({ intermediates: true });
 const data = JSON.stringify(s);
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
 const d = new Directory(dir(), 'media', draftId);
 if (!d.exists) d.create({ intermediates: true });
 const ext = src.mimeType.startsWith('video/') ? (src.mimeType === 'video/quicktime' ? 'mov' : 'mp4') : src.mimeType === 'application/pdf' ? 'pdf' : src.mimeType === 'image/png' ? 'png' : src.mimeType === 'image/heic' ? 'heic' : 'jpg';
 const dest = new File(d, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
 new File(src.uri).copy(dest);
 return { uri: dest.uri, name: src.name, mimeType: src.mimeType, takenAt: new Date().toISOString(), ...(src.width ? { width: src.width } : {}), ...(src.height ? { height: src.height } : {}), ...(src.durationSec ? { durationSec: src.durationSec } : {}) };
}

export function deleteMedia(draftId: string): void {
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
