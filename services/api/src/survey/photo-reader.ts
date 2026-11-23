/**
 * Reads nameplates and floor plans from a homeowner photo with a vision model. The image is sent to the
 * provider and never stored. Disabled unless SURVEY_PHOTO_READER=anthropic and ANTHROPIC_API_KEY are set
 * (sending photos to a processor requires a DPA and an updated privacy notice).
 */
export const READ_KINDS = ['boiler_nameplate', 'heat_pump_nameplate', 'ac_nameplate', 'water_heater_nameplate', 'cadastral_plan'] as const;
export type ReadKind = (typeof READ_KINDS)[number];
export type ReaderFields = {
 type?: 'boiler' | 'heat_pump' | 'air_conditioner' | 'water_heater' | 'floor_plan';
 brand?: string; model?: string; nominalPowerKw?: number; year?: number; condensing?: boolean;
 fuel?: 'metano' | 'gpl' | 'gasolio'; refrigerant?: string; capacityLitres?: number; floorAreaM2?: number;
};
export interface PhotoReader { readonly modelId: string; read(kind: ReadKind, mimeType: string, data: Buffer): Promise<{ fields: ReaderFields; summary: string }> }
export const PHOTO_READER = Symbol('PHOTO_READER');

const PROMPTS: Record<ReadKind, string> = {
 boiler_nameplate: 'Targhetta di una caldaia o generatore di calore.',
 heat_pump_nameplate: 'Targhetta di una pompa di calore.',
 ac_nameplate: 'Targhetta di un\'unità esterna di climatizzatore (split).',
 water_heater_nameplate: 'Etichetta di uno scaldacqua o boiler.',
 cadastral_plan: 'Planimetria catastale italiana di un\'unità immobiliare.',
};

/** Keeps only known keys with plausible values: provider output is untrusted. */
export function sanitizeReaderFields(raw: unknown): ReaderFields {
 const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
 const out: ReaderFields = {};
 const str = (v: unknown, max = 60) => (typeof v === 'string' && v.trim() ? v.trim().replace(/[\u0000-\u001f]/g, '').slice(0, max) : undefined);
 const num = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
 if (['boiler', 'heat_pump', 'air_conditioner', 'water_heater', 'floor_plan'].includes(o.type as string)) out.type = o.type as ReaderFields['type'];
 const brand = str(o.brand); if (brand) out.brand = brand;
 const model = str(o.model); if (model) out.model = model;
 const kw = num(o.nominalPowerKw, 0.5, 500); if (kw !== undefined) out.nominalPowerKw = Math.round(kw * 10) / 10;
 const y = num(o.year, 1950, new Date().getFullYear() + 1); if (y !== undefined) out.year = Math.round(y);
 if (typeof o.condensing === 'boolean') out.condensing = o.condensing;
 if (o.fuel === 'metano' || o.fuel === 'gpl' || o.fuel === 'gasolio') out.fuel = o.fuel;
 const r = str(o.refrigerant, 12); if (r) out.refrigerant = r;
 const l = num(o.capacityLitres, 5, 2000); if (l !== undefined) out.capacityLitres = Math.round(l);
 const a = num(o.floorAreaM2, 10, 2000); if (a !== undefined) out.floorAreaM2 = Math.round(a);
 return out;
}

export class AnthropicPhotoReader implements PhotoReader {
 constructor(private readonly apiKey: string, private readonly model: string, private readonly fetchImpl: typeof fetch = fetch) {}
 get modelId() { return `anthropic/${this.model}`; }
 async read(kind: ReadKind, mimeType: string, data: Buffer) {
  const instruction = `${PROMPTS[kind]} Estrai SOLO ciò che è leggibile, senza inventare. Rispondi con un unico oggetto JSON con le chiavi opzionali: ` +
   '"type" ("boiler"|"heat_pump"|"air_conditioner"|"water_heater"|"floor_plan"), "brand", "model", "nominalPowerKw" (numero, potenza termica nominale utile in kW), ' +
   '"year" (anno di fabbricazione), "condensing" (true/false se dichiarato o deducibile dal modello), "fuel" ("metano"|"gpl"|"gasolio"), "refrigerant", "capacityLitres", ' +
   '"floorAreaM2" (solo per planimetrie con superficie indicata), "summary" (max 15 parole in italiano). Nessun testo fuori dal JSON.';
  const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
   method: 'POST',
   headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
   body: JSON.stringify({ model: this.model, max_tokens: 400, messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: mimeType, data: data.toString('base64') } },
    { type: 'text', text: instruction },
   ] }] }),
   signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`provider ${res.status}`);
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (body.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  let parsed: unknown = {};
  try { parsed = JSON.parse(json); } catch { parsed = {}; }
  const summary = typeof (parsed as { summary?: unknown }).summary === 'string' ? String((parsed as { summary: string }).summary).slice(0, 160) : '';
  return { fields: sanitizeReaderFields(parsed), summary };
 }
}

export function photoReaderFromEnv(env = process.env): PhotoReader | null {
 if (env.SURVEY_PHOTO_READER !== 'anthropic' || !env.ANTHROPIC_API_KEY) return null;
 return new AnthropicPhotoReader(env.ANTHROPIC_API_KEY, env.ANTHROPIC_VISION_MODEL ?? 'claude-sonnet-4-5');
}
