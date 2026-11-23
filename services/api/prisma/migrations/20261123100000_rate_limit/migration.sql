-- Shared rate-limit counters for multi-instance deployments.
CREATE TABLE "RateLimitBucket" ("key" TEXT NOT NULL,"hits" INTEGER NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"blockedUntil" TIMESTAMP(3),CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key"));
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
