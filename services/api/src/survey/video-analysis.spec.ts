import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AnthropicVideoAnalyzer, sampleFrames, sanitizeAnalysis, videoAnalyzerFromEnv } from './video-analysis';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

describe('video pre-survey', () => {
 it('is off by default', () => { expect(videoAnalyzerFromEnv({})).toBeNull(); });
 it('keeps only the closed vocabulary', () => {
  const r = sanitizeAnalysis({ rooms: 5, summary: 'ok', findings: [{ category: 'serramento', description: 'Doppio vetro, telaio in legno', confidence: 0.8, frame: 3 }, { category: 'classe', description: 'G' }, { category: 'stanza', description: '' }] }, 10);
  expect(r.rooms).toBe(5); expect(r.findings).toHaveLength(1); expect(r.findings[0].frame).toBe(3);
  expect(sanitizeAnalysis('x', 3)).toEqual({ rooms: null, findings: [], summary: '' });
 });
 it.skipIf(!hasFfmpeg)('samples frames and sends them in order to the model', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'va-')); const f = join(dir, 'v.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=5:duration=13', '-pix_fmt', 'yuv420p', f]);
  const frames = await sampleFrames(readFileSync(f), 6, 40);
  expect(frames.length).toBeGreaterThanOrEqual(2);
  let images = 0;
  const fake = (async (_u: string, init: any) => { images = JSON.parse(init.body).messages[0].content.filter((c: any) => c.type === 'image').length;
   return new Response(JSON.stringify({ content: [{ type: 'text', text: '{"rooms":2,"findings":[{"category":"terminale","description":"Termosifone in ghisa","confidence":0.7,"frame":1}],"summary":"Due ambienti"}' }] })); }) as unknown as typeof fetch;
  const r = await new AnthropicVideoAnalyzer('k', 'm', fake).analyze(readFileSync(f));
  expect(images).toBe(frames.length); expect(r.rooms).toBe(2); expect(r.findings[0].category).toBe('terminale');
 });
});
