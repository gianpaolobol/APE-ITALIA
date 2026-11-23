/**
 * Walkthrough video limits. About 20–25 s per room plus the exterior: long enough to show every room,
 * window and radiator, short enough to upload (720p H.264 ≈ 30–40 MB per minute; 6 min ≈ 200 MB).
 */
import type { Answers } from './questions';

export const VIDEO_MAX_CLIPS = 3;
export const VIDEO_TIERS = [
 { upTo: 60, seconds: 90, label: 'fino a 60 m²' },
 { upTo: 100, seconds: 120, label: '61–100 m²' },
 { upTo: 150, seconds: 180, label: '101–150 m²' },
 { upTo: 250, seconds: 240, label: '151–250 m²' },
 { upTo: Infinity, seconds: 300, label: 'oltre 250 m²' },
] as const;
/** Detached houses also film facades, roof edge and outdoor units: one extra minute, 6 minutes at most. */
export const HOUSE_EXTRA_SECONDS = 60;
export const VIDEO_ABSOLUTE_MAX_SECONDS = 360;

export function videoBudgetSeconds(a: Answers): number {
 const area = typeof a.floorArea === 'number' ? a.floorArea : 80;
 const base = VIDEO_TIERS.find(t => area <= t.upTo)!.seconds;
 const house = a.propertyType === 'casa' || a.propertyType === 'schiera';
 return Math.min(VIDEO_ABSOLUTE_MAX_SECONDS, base + (house ? HOUSE_EXTRA_SECONDS : 0));
}

export const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
