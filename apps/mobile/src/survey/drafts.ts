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
 status: 'bozza' | 'inviata';
 sentAt?: string;
 remoteCaseId?: string;
};

export type AppState = { version: 1; drafts: Draft[]; pro?: { data: ProRegistration; submittedAt: string; status: 'in_verifica' | 'inviata_al_server' } };

const EMPTY: AppState = { version: 1, drafts: [] };
const dir = () => new Directory(Paths.document, 'ape');
const stateFile = () => new File(dir(), 'state.json');

export async function loadState(): Promise<AppState> {
 try {
  const f = stateFile();
  if (!f.exists) return EMPTY;
  const parsed = JSON.parse(await f.text()) as AppState;
  return parsed && parsed.version === 1 && Array.isArray(parsed.drafts) ? parsed : EMPTY;
 } catch {
  return EMPTY;
 }
}

export async function saveState(s: AppState): Promise<void> {
 const d = dir();
 if (!d.exists) d.create({ intermediates: true });
 const tmp = new File(d, 'state.tmp.json');
 if (tmp.exists) tmp.delete();
 tmp.create();
 tmp.write(JSON.stringify(s));
 const f = stateFile();
 if (f.exists) f.delete();
 tmp.move(f);
}

/** Copies a picked image/PDF into app storage so it survives cache cleanup. */
export function persistPhoto(draftId: string, src: { uri: string; name: string; mimeType: string; width?: number; height?: number }): PhotoRef {
 const d = new Directory(dir(), 'media', draftId);
 if (!d.exists) d.create({ intermediates: true });
 const ext = src.mimeType === 'application/pdf' ? 'pdf' : src.mimeType === 'image/png' ? 'png' : 'jpg';
 const dest = new File(d, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
 new File(src.uri).copy(dest);
 return { uri: dest.uri, name: src.name, mimeType: src.mimeType, takenAt: new Date().toISOString(), ...(src.width ? { width: src.width } : {}), ...(src.height ? { height: src.height } : {}) };
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
