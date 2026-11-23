import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Pre-survey from the walkthrough video: frames are sampled with ffmpeg and described by a vision model.
 * The output is a draft for the certifier (rooms, windows, emitters, systems, visible issues), never a
 * measurement: every item carries a confidence and must be confirmed during the on-site inspection.
 */
export type VideoFinding = { category: 'stanza' | 'serramento' | 'terminale' | 'generatore' | 'raffrescamento' | 'acqua_calda' | 'rinnovabili' | 'criticita' | 'altro'; description: string; confidence: number; frame: number };
export type VideoAnalysis = { modelId: string; frames: number; rooms: number | null; findings: VideoFinding[]; summary: string; analyzedAt: string };
export interface VideoAnalyzer { readonly modelId: string; analyze(video: Buffer): Promise<VideoAnalysis> }
export const VIDEO_ANALYZER = Symbol('VIDEO_ANALYZER');

const CATEGORIES = ['stanza', 'serramento', 'terminale', 'generatore', 'raffrescamento', 'acqua_calda', 'rinnovabili', 'criticita', 'altro'] as const;

/** Untrusted model output -> closed vocabulary, bounded sizes. */
export function sanitizeAnalysis(raw: unknown, frames: number): Omit<VideoAnalysis, 'modelId' | 'analyzedAt' | 'frames'> {
 const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
 const list = Array.isArray(o.findings) ? o.findings.slice(0, 80) : [];
 const findings: VideoFinding[] = [];
 for (const f of list) {
  const x = f && typeof f === 'object' ? (f as Record<string, unknown>) : {};
  if (!(CATEGORIES as readonly unknown[]).includes(x.category) || typeof x.description !== 'string' || !x.description.trim()) continue;
  const conf = typeof x.confidence === 'number' && Number.isFinite(x.confidence) ? Math.min(1, Math.max(0, x.confidence)) : 0.5;
  const frame = typeof x.frame === 'number' && Number.isInteger(x.frame) && x.frame >= 1 && x.frame <= frames ? x.frame : 1;
  findings.push({ category: x.category as VideoFinding['category'], description: x.description.trim().replace(/[\u0000-\u001f]/g, ' ').slice(0, 200), confidence: Math.round(conf * 100) / 100, frame });
 }
 const rooms = typeof o.rooms === 'number' && Number.isInteger(o.rooms) && o.rooms >= 0 && o.rooms <= 60 ? o.rooms : null;
 const summary = typeof o.summary === 'string' ? o.summary.trim().slice(0, 600) : '';
 return { rooms, findings, summary };
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<number> {
 return new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: 'ignore' });
  const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
  p.on('error', e => { clearTimeout(t); reject(e); });
  p.on('close', c => { clearTimeout(t); resolve(c ?? -1); });
 });
}

/** One frame every `everySec` seconds, at most `max`, 768 px wide JPEGs. */
export async function sampleFrames(video: Buffer, everySec = 6, max = 40, ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg'): Promise<Buffer[]> {
 const dir = await mkdtemp(join(tmpdir(), 'ape-frames-'));
 try {
  await writeFile(join(dir, 'in.mp4'), video, { mode: 0o600 });
  const code = await run(ffmpeg, ['-v', 'error', '-i', join(dir, 'in.mp4'), '-vf', `fps=1/${everySec},scale=768:-2`, '-frames:v', String(max), '-q:v', '5', join(dir, 'f%03d.jpg')], 120_000);
  if (code !== 0) throw new Error('frame extraction failed');
  const files = (await readdir(dir)).filter(f => f.endsWith('.jpg')).sort();
  return Promise.all(files.map(f => readFile(join(dir, f))));
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
}

export class AnthropicVideoAnalyzer implements VideoAnalyzer {
 constructor(private readonly apiKey: string, private readonly model: string, private readonly fetchImpl: typeof fetch = fetch, private readonly frames: (v: Buffer) => Promise<Buffer[]> = v => sampleFrames(v)) {}
 get modelId() { return `anthropic/${this.model}`; }
 async analyze(video: Buffer): Promise<VideoAnalysis> {
  const frames = await this.frames(video);
  if (!frames.length) throw new Error('no frames');
  const content: unknown[] = frames.flatMap((f, i) => [{ type: 'text', text: `Fotogramma ${i + 1}` }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.toString('base64') } }]);
  content.push({ type: 'text', text: 'Sono fotogrammi in ordine di un video in cui il proprietario percorre un immobile per un pre-rilievo energetico (APE). ' +
   'Descrivi SOLO ciò che si vede, senza stimare misure o classi energetiche. Rispondi con un unico JSON: {"rooms": numero di ambienti distinti visti, ' +
   '"findings": [{"category": una tra stanza|serramento|terminale|generatore|raffrescamento|acqua_calda|rinnovabili|criticita|altro, "description": max 25 parole in italiano ' +
   '(es. tipo di vetro e telaio, termosifone in ghisa con valvola termostatica, split a parete, caldaia murale, macchie di umidità), "confidence": 0-1, "frame": numero del fotogramma}], ' +
   '"summary": max 60 parole per il certificatore}. Non descrivere persone né oggetti personali.' });
  const res = await this.fetchImpl('https://api.anthropic.com/v1/messages', {
   method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': this.apiKey, 'anthropic-version': '2023-06-01' },
   body: JSON.stringify({ model: this.model, max_tokens: 2500, messages: [{ role: 'user', content }] }), signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`provider ${res.status}`);
  const body = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (body.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join('');
  let parsed: unknown = {};
  try { parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { parsed = {}; }
  return { modelId: this.modelId, frames: frames.length, analyzedAt: new Date().toISOString(), ...sanitizeAnalysis(parsed, frames.length) };
 }
}

export function videoAnalyzerFromEnv(env = process.env): VideoAnalyzer | null {
 if (env.SURVEY_PHOTO_READER !== 'anthropic' || !env.ANTHROPIC_API_KEY) return null;
 return new AnthropicVideoAnalyzer(env.ANTHROPIC_API_KEY, env.ANTHROPIC_VISION_MODEL ?? 'claude-sonnet-4-5');
}
