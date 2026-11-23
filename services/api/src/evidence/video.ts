import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Walkthrough videos are re-muxed before storage: container and stream metadata (GPS position, device,
 * creation time) and the audio track (voices of people at home) are removed. Video frames are copied,
 * not re-encoded. Requires ffmpeg/ffprobe on the PATH; without them video uploads are refused.
 */
export class VideoToolMissingError extends Error {}
export class InvalidVideoError extends Error {}

function run(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
 return new Promise((resolve, reject) => {
  const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const t = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
  p.stdout.on('data', d => { stdout += d; if (stdout.length > 1e6) stdout = stdout.slice(-1e6); });
  p.stderr.on('data', d => { stderr += d; if (stderr.length > 1e5) stderr = stderr.slice(-1e5); });
  p.on('error', e => { clearTimeout(t); reject((e as NodeJS.ErrnoException).code === 'ENOENT' ? new VideoToolMissingError(cmd) : e); });
  p.on('close', code => { clearTimeout(t); resolve({ code: code ?? -1, stdout, stderr }); });
 });
}

export async function sanitizeVideo(input: Buffer, maxSeconds: number, bin = { ffmpeg: process.env.FFMPEG_PATH ?? 'ffmpeg', ffprobe: process.env.FFPROBE_PATH ?? 'ffprobe' }):
 Promise<{ data: Buffer; durationSeconds: number }> {
 const dir = await mkdtemp(join(tmpdir(), 'ape-video-'));
 try {
  const src = join(dir, 'in'), out = join(dir, 'out.mp4');
  await writeFile(src, input, { mode: 0o600 });
  const probe = await run(bin.ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', src], 30_000);
  if (probe.code !== 0) throw new InvalidVideoError('unreadable video');
  const info = JSON.parse(probe.stdout || '{}') as { format?: { duration?: string }; streams?: Array<{ codec_type?: string }> };
  const duration = Number(info.format?.duration);
  if (!info.streams?.some(s => s.codec_type === 'video') || !Number.isFinite(duration) || duration <= 0) throw new InvalidVideoError('no video stream');
  if (duration > maxSeconds) throw new InvalidVideoError(`video longer than ${maxSeconds} s`);
  const r = await run(bin.ffmpeg, ['-v', 'error', '-y', '-i', src, '-map', '0:v:0', '-an', '-sn', '-dn', '-map_metadata', '-1', '-map_metadata:s:v', '-1', '-map_chapters', '-1',
   '-c:v', 'copy', '-movflags', '+faststart', '-f', 'mp4', out], 120_000);
  if (r.code !== 0) throw new InvalidVideoError('remux failed');
  return { data: await readFile(out), durationSeconds: Math.round(duration) };
 } finally {
  await rm(dir, { recursive: true, force: true });
 }
}
