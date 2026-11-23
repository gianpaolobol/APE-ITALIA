import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { InvalidVideoError, VideoToolMissingError, sanitizeVideo } from './video';
import { isAllowedForKind, sniffMimeType } from './file-policy';

const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

function sample(seconds: number): Buffer {
 const dir = mkdtempSync(join(tmpdir(), 'vtest-'));
 const out = join(dir, 'v.mov');
 execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc=size=320x240:rate=10:duration=${seconds}`, '-f', 'lavfi', '-i', `sine=duration=${seconds}`,
  '-metadata', 'location=+44.4949+011.3426/', '-metadata', 'com.apple.quicktime.location.ISO6709=+44.4949+011.3426/', '-metadata', 'make=Apple',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', out]);
 return readFileSync(out);
}

describe.skipIf(!hasFfmpeg)('walkthrough video sanitization (ffmpeg)', () => {
 it('removes GPS/device metadata and the audio track, keeps the video', async () => {
  const input = sample(2);
  expect(input.includes(Buffer.from('+44.4949'))).toBe(true);
  const { data, durationSeconds } = await sanitizeVideo(input, 60);
  expect(durationSeconds).toBe(2);
  expect(data.includes(Buffer.from('+44.4949'))).toBe(false);
  expect(data.includes(Buffer.from('Apple'))).toBe(false);
  expect(sniffMimeType(data)).toBe('video/mp4');
  const dir = mkdtempSync(join(tmpdir(), 'vchk-')); const f = join(dir, 'o.mp4'); writeFileSync(f, data);
  const streams = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).toString().trim().split('\n');
  expect(streams).toEqual(['video']);
 });
 it('rejects videos longer than the limit and non-videos', async () => {
  await expect(sanitizeVideo(sample(3), 2)).rejects.toBeInstanceOf(InvalidVideoError);
  await expect(sanitizeVideo(Buffer.from('not a video at all'), 60)).rejects.toBeInstanceOf(InvalidVideoError);
 });
});

describe('video policy', () => {
 it('videos only for the video kind', () => {
  expect(isAllowedForKind('video', 'video/mp4')).toBe(true);
  expect(isAllowedForKind('boiler', 'video/mp4')).toBe(false);
  expect(isAllowedForKind('video', 'image/jpeg')).toBe(false);
 });
 it('fails closed when ffmpeg is missing', async () => {
  await expect(sanitizeVideo(Buffer.from('x'), 60, { ffmpeg: '/nonexistent/ffmpeg', ffprobe: '/nonexistent/ffprobe' })).rejects.toBeInstanceOf(VideoToolMissingError);
 });
});
