# API and worker image. Build from the repository root:
#   docker build -f services/api/Dockerfile -t ape-italia-api .
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

FROM node:22-bookworm-slim
WORKDIR /app
# ffmpeg: walkthrough videos are re-muxed without metadata and audio before storage.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ARG APE_BUILD_REVISION=unknown
RUN printf '%s\n' "$APE_BUILD_REVISION" > /app/ape-build-revision && chmod 0444 /app/ape-build-revision
# Prisma CLI stays in the image so the same image can run `prisma migrate deploy` as a one-shot job.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/services/api/package.json ./services/api/package.json
COPY --from=build /app/services/api/prisma ./services/api/prisma
COPY --from=build /app/services/api/dist ./services/api/dist
RUN mkdir -p /var/lib/ape-italia/evidence && chown -R node:node /var/lib/ape-italia
USER node
WORKDIR /app/services/api
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
