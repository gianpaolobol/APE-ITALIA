import type { PrismaClient } from '@prisma/client';
import { expireStaleOffers } from '../certifiers/assignment.service';
import { purgeExpiredEvidence, retentionPolicyFromEnv } from '../privacy/privacy';
import type { ObjectStorage } from '../evidence/storage';
import type { MalwareScanner } from '../evidence/file-policy';
import { rescanPending } from '../evidence/rescan';

/** Fixed advisory-lock keys: one runner per job across all worker instances. */
export const LOCKS = { expireOffers: 72_001, retention: 72_002, rescan: 72_003 } as const;
type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

/**
 * Runs `fn` only if this instance obtains the transaction-scoped advisory lock; other instances skip.
 * The lock is released automatically at commit/rollback.
 */
export async function withLock<T>(db: PrismaClient, lock: number, fn: (tx: Tx) => Promise<T>): Promise<{ ran: boolean; result?: T }> {
 return db.$transaction(async tx => {
  const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${lock}::bigint) AS locked`;
  if (!locked) return { ran: false };
  return { ran: true, result: await fn(tx) };
 }, { timeout: 120_000 });
}

export async function runExpireOffers(db: PrismaClient, now = new Date()) {
 return withLock(db, LOCKS.expireOffers, tx => expireStaleOffers(tx, now));
}

/** Retention runs as a dry run unless RETENTION_APPLY=1 is explicitly set. */
export async function runRetention(db: PrismaClient, storage: ObjectStorage | null, env = process.env) {
 const apply = env.RETENTION_APPLY === '1';
 return withLock(db, LOCKS.retention, async () => purgeExpiredEvidence(db, storage, retentionPolicyFromEnv(env), { apply }));
}

export async function runRescan(db: PrismaClient, storage: ObjectStorage, scanner: MalwareScanner) {
 return withLock(db, LOCKS.rescan, () => rescanPending(db, storage, scanner));
}

export type Schedule = { name: string; everyMs: number; run: () => Promise<unknown> };

/** Minimal scheduler: sequential per job (no overlap), errors logged by name only (no payloads). */
export function startSchedules(schedules: Schedule[], log: (msg: string) => void = m => console.log(m)) {
 const timers = schedules.map(s => {
  let running = false;
  const tick = async () => {
   if (running) return;
   running = true;
   try { const r = await s.run(); log(`[worker] ${s.name} ok ${JSON.stringify(summary(r))}`); }
   catch (e) { log(`[worker] ${s.name} failed: ${e instanceof Error ? e.name : 'error'}`); }
   finally { running = false; }
  };
  void tick();
  return setInterval(tick, s.everyMs);
 });
 return () => timers.forEach(clearInterval);
}

function summary(r: unknown) {
 if (r && typeof r === 'object' && 'ran' in r) {
  const x = r as { ran: boolean; result?: unknown };
  if (!x.ran) return { skipped: 'locked by another instance' };
  if (typeof x.result === 'number') return { count: x.result };
  if (x.result && typeof x.result === 'object' && 'clean' in x.result) return x.result;
  if (x.result && typeof x.result === 'object' && 'cases' in x.result) {
   const p = x.result as { applied: boolean; cases: unknown[] };
   return { applied: p.applied, cases: p.cases.length };
  }
 }
 return {};
}
