# Quality gates — Sprint 1
- [ ] npm ci passes from clean checkout — *nessun package-lock.json nel repo; la CI usa `npm install`*
- [x] prisma validate and generate pass — CI Run #79, #81
- [x] PostgreSQL migration generated and applied against clean DB — CI Run #81 (`migrate deploy` + `migrate diff --exit-code`: "No difference detected")
- [x] API TypeScript typecheck passes — CI Run #79, #81
- [x] Web build passes — CI Run #79, #81
- [x] API runtime health endpoint returns 200 — `src/app.http.spec.ts` (modulo Nest reale su HTTP, DB stub), CI Run #81
- [x] No token => 401, invalid token => 401, invalid tenant => 403 — `app.http.spec.ts`, `auth.service.spec.ts` (JWT RS256 firmati, JWKS fixture), CI Run #81
- [x] Tenant A cannot read or create resources in tenant B — `tenant-db`, `auth-db`, `members-db` integration su PostgreSQL, CI Run #81
- [x] Unknown property ID returns 404 (not leak) — `tenant-db.integration.spec.ts`, CI Run #81
- [x] Audit log records creations — integrazione PostgreSQL (property, case, organization, membership, invitation), CI Run #81
- [ ] Android and iOS smoke tests — *solo bundle Hermes `expo export` verificato; nessun dispositivo*
- [ ] Secrets scan and dependency audit
- [ ] PR review and MASTER_PLAN updated — *MASTER_PLAN aggiornato; review umana mancante*
No checkboxes may be checked without evidence from executed tests.
