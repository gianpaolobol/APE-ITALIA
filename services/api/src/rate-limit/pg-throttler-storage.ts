import type { PrismaClient } from '@prisma/client';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

type Row = { hits: number; ttl_ms: number; block_ms: number | null };

/**
 * PostgreSQL-backed throttler storage. One atomic upsert per request: a fixed window per key that
 * restarts when expired (unless blocked); exceeding the limit blocks the key for blockDuration.
 */
export class PgThrottlerStorage implements ThrottlerStorage {
 constructor(private readonly db: Pick<PrismaClient, '$queryRaw'>) {}

 async increment(key: string, ttl: number, limit: number, blockDuration: number, _throttlerName: string): Promise<ThrottlerStorageRecord> {
  const t = Math.max(1, Math.floor(ttl)), b = Math.max(1, Math.floor(blockDuration || ttl));
  const [row] = await this.db.$queryRaw<Row[]>`
   WITH up AS (
    INSERT INTO "RateLimitBucket" AS r ("key", "hits", "expiresAt", "blockedUntil")
    VALUES (${key}, 1, now() + make_interval(secs => ${t}::double precision / 1000),
            CASE WHEN 1 > ${limit}::int THEN now() + make_interval(secs => ${b}::double precision / 1000) END)
    ON CONFLICT ("key") DO UPDATE SET
     "hits" = CASE WHEN r."expiresAt" <= now() AND (r."blockedUntil" IS NULL OR r."blockedUntil" <= now()) THEN 1 ELSE r."hits" + 1 END,
     "expiresAt" = CASE WHEN r."expiresAt" <= now() AND (r."blockedUntil" IS NULL OR r."blockedUntil" <= now())
                        THEN now() + make_interval(secs => ${t}::double precision / 1000) ELSE r."expiresAt" END,
     "blockedUntil" = CASE
       WHEN r."blockedUntil" > now() THEN r."blockedUntil"
       WHEN (CASE WHEN r."expiresAt" <= now() AND (r."blockedUntil" IS NULL OR r."blockedUntil" <= now()) THEN 1 ELSE r."hits" + 1 END) > ${limit}::int
         THEN now() + make_interval(secs => ${b}::double precision / 1000)
       ELSE NULL END
    RETURNING "hits", "expiresAt", "blockedUntil"
   )
   SELECT "hits",
          GREATEST(0, EXTRACT(EPOCH FROM ("expiresAt" - now())) * 1000)::float8 AS ttl_ms,
          CASE WHEN "blockedUntil" > now() THEN EXTRACT(EPOCH FROM ("blockedUntil" - now())) * 1000 END::float8 AS block_ms
   FROM up`;
  const blocked = row.block_ms !== null && row.block_ms > 0;
  return { totalHits: row.hits, timeToExpire: Math.ceil(row.ttl_ms / 1000), isBlocked: blocked, timeToBlockExpire: blocked ? Math.ceil(row.block_ms! / 1000) : 0 };
 }
}

/** Removes stale buckets (worker job). */
export async function sweepRateLimitBuckets(db: PrismaClient): Promise<number> {
 return db.$executeRaw`DELETE FROM "RateLimitBucket" WHERE "expiresAt" < now() - interval '1 hour' AND ("blockedUntil" IS NULL OR "blockedUntil" < now())`;
}
