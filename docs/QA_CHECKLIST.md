# Quality gates — Sprint 1
- [ ] npm ci passes from clean checkout
- [ ] prisma validate and generate pass
- [ ] PostgreSQL migration generated and applied against clean DB
- [ ] API TypeScript typecheck passes
- [ ] Web build passes
- [ ] API runtime health endpoint returns 200
- [ ] No token => 401, invalid token => 401, invalid tenant => 403
- [ ] Tenant A cannot read or create resources in tenant B
- [ ] Unknown property ID returns 404 (not leak)
- [ ] Audit log records creations
- [ ] Android and iOS smoke tests
- [ ] Secrets scan and dependency audit
- [ ] PR review and MASTER_PLAN updated
No checkboxes may be checked without evidence from executed tests.
