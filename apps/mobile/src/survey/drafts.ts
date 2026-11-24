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

export type AppState = { version: 1; drafts: Draft[]; pro?: { data: ProRegistration; submittedAt: string; status: 'in_verifica' | 'inviata_al_server' } };

export type DraftOwner = { subject: string; organizationId: string | null };
/** Unattributed legacy remote drafts are quarantined, not assigned to a new account. */
export function canViewDraft(d: Draft, owner: DraftOwner | null): boolean {
 const matches = (bound: DraftOwner) => owner !== null && bound.subject === owner.subject && bound.organizationId === owner.organizationId;
 if (d.localOwner && !matches(d.localOwner)) return false;
 if (d.remoteOwner) return matches(d.remoteOwner);
 if (d.remoteCaseId || d.remotePropertyId || Object.keys(d.videoUploads ?? {}).length || d.uploaded?.length) return false;
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

export function deletePhotoFile(p: PhotoRef): void {
 try { const f = new File(p.uri); if (f.exists) f.delete(); } catch { /* best effort */ }
}

export function newDraft(): Draft {
 const now = new Date().toISOString();
 return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, createdAt: now, updatedAt: now, answers: {}, photos: {}, status: 'bozza' };
}
