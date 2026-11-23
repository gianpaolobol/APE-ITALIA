/**
 * Client of the photo reader (POST /v1/survey/read-photo, multipart). The server forwards the image to the
 * configured vision model only when the operator enabled it; otherwise the feature is simply hidden.
 */
import type { Answers, ExtractKind, PhotoRef } from './survey/questions';

const base = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
export const photoReaderAvailable = (): boolean => /^https:\/\//.test(base) && process.env.EXPO_PUBLIC_PHOTO_READER === 'on';

export type ReadResult = { fields: Answers; summary: string };

/** Maps the server's normalized fields onto survey answers (only known keys, validated ranges). */
export function mapReaderFields(kind: ExtractKind, f: Record<string, unknown>): Answers {
 const out: Answers = {};
 const n = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
 const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 80) : undefined);
 if (kind === 'boiler_nameplate' || kind === 'heat_pump_nameplate') {
  const brand = [s(f.brand), s(f.model)].filter(Boolean).join(' ');
  if (brand) out.generatorBrand = brand;
  const kw = n(f.nominalPowerKw, 1, 500); if (kw !== undefined) out.generatorPowerKw = kw;
  const y = n(f.year, 1960, 2030); if (y !== undefined) out.generatorYear = Math.round(y);
  if (f.condensing === true) out.heatGenerator = 'caldaia_condensazione';
  else if (f.condensing === false && f.type === 'boiler') out.heatGenerator = 'caldaia_tradizionale';
  if (f.type === 'heat_pump') out.heatGenerator = 'pompa_calore';
  if (f.fuel === 'metano' || f.fuel === 'gpl' || f.fuel === 'gasolio') out.fuel = f.fuel;
 }
 if (kind === 'ac_nameplate') { const y = n(f.year, 1980, 2030); if (y !== undefined) out.coolingYear = Math.round(y); }
 if (kind === 'cadastral_plan') { const a = n(f.floorAreaM2, 15, 1000); if (a !== undefined) out.floorArea = Math.round(a); }
 return out;
}

export async function readPhoto(kind: ExtractKind, photo: PhotoRef): Promise<ReadResult | null> {
 if (!photoReaderAvailable() || photo.mimeType === 'application/pdf') return null;
 const form = new FormData();
 form.append('kind', kind);
 form.append('file', { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);
 const res = await fetch(`${base}/v1/survey/read-photo`, { method: 'POST', body: form });
 if (!res.ok) return null;
 const body = (await res.json()) as { fields?: Record<string, unknown>; summary?: string };
 return { fields: mapReaderFields(kind, body.fields ?? {}), summary: typeof body.summary === 'string' ? body.summary.slice(0, 300) : '' };
}
