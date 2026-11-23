-- Passwordless email login (one-time codes) and platform refresh tokens.
CREATE TABLE "PlatformUser" ("id" TEXT NOT NULL,"email" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastLoginAt" TIMESTAMP(3),"deletedAt" TIMESTAMP(3),"pushTokens" TEXT[],CONSTRAINT "PlatformUser_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");
CREATE TABLE "LoginCode" ("id" TEXT NOT NULL,"email" TEXT NOT NULL,"codeHash" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"attempts" INTEGER NOT NULL DEFAULT 0,"consumedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "LoginCode_pkey" PRIMARY KEY ("id"));
CREATE INDEX "LoginCode_email_createdAt_idx" ON "LoginCode"("email", "createdAt");
CREATE TABLE "RefreshToken" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"tokenHash" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,"revokedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
