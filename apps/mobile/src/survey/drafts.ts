/** On-device persistence of requests (local-first: the app works without a server). */
import { Directory, File, Paths } from 'expo-file-system';
import type { Answers, PhotoRef, Photos } from './questions';
import type { ProRegistration } from '../pro/registration';

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
 /** Local photo URIs already uploaded to remoteCaseId. */
 uploaded?: string[];
};

export type AppState = { version: 1; drafts: Draft[]; pro?: { data: ProRegistration; submittedAt: string; status: 'in_verifica' | 'inviata_al_server' } };

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

/** Falls back to the previous good copy if the main file is missing or corrupt. */
export async function loadState(): Promise<AppState> {
 return (await read(stateFile())) ?? (await read(backupFile())) ?? EMPTY;
}

export async function saveState(s: AppState): Promise<void> {
 const d = dir();
 if (!d.exists) d.create({ intermediates: true });
 const tmp = new File(d, 'state.tmp.json');
 if (tmp.exists) tmp.delete();
 tmp.create();
 tmp.write(JSON.stringify(s));
 const f = stateFile();
 // Keep the previous version as backup: a crash between the two steps never loses everything.
 if (f.exists) { const b = backupFile(); if (b.exists) b.delete(); f.move(b); }
 tmp.move(stateFile());
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
