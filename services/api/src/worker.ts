import { PrismaClient } from '@prisma/client';
import { storageFromEnv } from './evidence/storage';
import { runExpireOffers, runRetention, startSchedules } from './worker/jobs';

/** Background worker: `node dist/worker.js`. Safe to run on several instances (advisory locks). */
const db = new PrismaClient();
const minutes = (v: string | undefined, d: number) => { const n = Number(v); return (Number.isFinite(n) && n >= 1 ? n : d) * 60_000; };
const stop = startSchedules([
 { name: 'expire-offers', everyMs: minutes(process.env.WORKER_EXPIRE_EVERY_MIN, 15), run: () => runExpireOffers(db) },
 { name: 'retention', everyMs: minutes(process.env.WORKER_RETENTION_EVERY_MIN, 24 * 60), run: () => runRetention(db, storageFromEnv()) },
]);
const shutdown = async () => { stop(); await db.$disconnect(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
