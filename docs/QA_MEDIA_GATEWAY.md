# Media gateway cumulative candidate — 26 November 2026, iteration 53

## Verified inputs
- Main at start: 295fc3f464d10a3a7a184702a99600459b9b4135. Backup/2026-11-25-stable: 53b9c11cef75a4c4486318e963e6a8b3352a8b31, read only.
- PR #94 head 62c6607df87efc2f79ebf8ddef0f4e3fbd23a4dd, CI 45735958614: verify, containers, keycloak-e2e, clamav all success.
- PR #95 head c371b39b6f1a0dc404a8865b3592a9ef7c4f4166, CI 45742493267: same four jobs success.
- PR #96 head e71472d27b05a75c4673de37bf59fd87dff6354f, CI 45749116564: same four jobs success. No external review recorded on #94–96. #93 still open. No confirmed Work writer.
- Cumulative candidate based on #96 exact head, copies source and tests of #94 and #95 at their exact heads. No changes to original PR branches. Do not merge overlapping PRs in parallel. Independent security review still required; compare fresh main and reconcile before merging any candidate. Original QA records remain linked above.

## Implemented
- media-gateway.ts composes actual XChaCha20-Poly1305 envelope, key manager and bounded native staging; no new dependencies.
- Requires scope guard, durable cleanup reservation before writing and global encrypted-evidence scan for sealing. Opening always fails closed if key missing. Native wrappers constrain durable paths to ape/media/<draft>/<filename> and temporary plaintext paths to private cache ape-media-open/<name>. Full authentication and handle closure precede temporary plaintext consumer; cleanup in finally. Journal must remain available across process death and cover temporary paths.
- Eight synthetic integrated tests: multi-block roundtrip, failed journal, corrupt final tag, wrong identity, lost key, consumer failure/session change, existing destination, session change during reservation. Not executed on new cumulative SHA yet. Component CI is not evidence of cumulative CI.

## Remaining P0
- No change yet to captureDraftMedia, PhotoRef, WizardScreen, ResultScreen, JobScreen, remote-submit or OCR consumers. Existing capture still copies plaintext; do not claim encrypted application storage.
- Implement authenticated manifest version, a serialized async transaction with current snapshot/owner/session checks (no stale state overwrite), durable reservation and restart recovery of cache, global evidence scan and key marker; migrate legacy files copy/verify/commit/delete with both authenticated snapshots confirmed before deleting originals. Do not infer owner from legacy data or treat a filename as authorization.
- Route all preview, video/PDF sharing, OCR and upload paths through authenticated read; asynchronous consumers must not retain deleted temporary paths; lifecycle cleanup on background/logout/restart. No unguarded plaintext fallback, including after invalid envelope. Verify device filesystem and backup exclusions; JavaScript buffers are not securely zeroized. Review replay of older valid envelopes with same identity; use immutable unique file IDs and authenticated manifest binding, not filename reuse.
- Separate cross-review and CI on exact cumulative SHA; native testing with interruption, low disk, key loss, app update, account switch; build and staging gates unchanged. No new hosting, charges deliberately incurred, physical tests or production deployment.

## Next integration
Prefer one cumulative review/CI instead of continuing to create isolated primitives. Preserve original PR history and avoid conflicts with Claude. Do not merge until independent review and CI requirements are met. Then prioritize a functional capture-to-read path plus restart migration, not additional speculative helpers.
