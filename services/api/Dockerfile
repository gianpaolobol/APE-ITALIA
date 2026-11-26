# Build, one-shot migration and minimal API/worker runtime from the same source.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/web/package.json apps/web/
COPY services/api/package.json services/api/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @ape/api --include-workspace-root --no-audit --no-fund
COPY services/api services/api
RUN npm run db:generate -w @ape/api && npm run build -w @ape/api

# The CLI is needed for migrations only, not the long-running services.
FROM build AS migration
ENV NODE_ENV=production
USER node
WORKDIR /app/services/api
CMD ["node", "/app/node_modules/prisma/build/index.js", "migrate", "deploy"]

# Fresh install from the same lockfile, not a copy of the development tree.
FROM node:22-bookworm-slim AS production-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/
COPY apps/web/package.json apps/web/
COPY services/api/package.json services/api/
COPY packages/shared/package.json packages/shared/
RUN PRISMA_SKIP_POSTINSTALL_GENERATE=true npm ci --omit=dev --workspace @ape/api --include-workspace-root --no-audit --no-fund
# Generated client and native engine must match the exact client in the lockfile.
COPY --from=build /app/node_modules/.prisma/client ./node_modules/.prisma/client
RUN node -e "require('@prisma/client'); for (const name of ['prisma','@nestjs/cli','vitest']) { try { require.resolve(name + '/package.json'); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') continue; throw e; } throw Error('Unexpected development dependency: ' + name); }"

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# ffmpeg: walkthrough videos are re-muxed without metadata and audio before storage.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ARG APE_BUILD_REVISION=unknown
RUN printf '%s\n' "$APE_BUILD_REVISION" > /app/ape-build-revision && chmod 0444 /app/ape-build-revision
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/services/api/package.json ./services/api/package.json
COPY --from=build /app/services/api/dist ./services/api/dist
RUN mkdir -p /var/lib/ape-italia/evidence && chown -R node:node /var/lib/ape-italia
USER node
WORKDIR /app/services/api
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
