# Forma — Remaining Work to Production-Ready (Phase 2 onward)

**Date:** 2026-09-29
**Supersedes:** `2025-06-27_forma-implementation-plan.md` — that plan's Phases 0–6
(CRUD, builder, public submissions, webhooks, analytics, billing, RBAC) are
already built. Its Phase 7 (production polish/deployment) is what this
document replaces, using the phase numbers already in use in this repo's
commits and branches:

- **Phase 0** (done, commit `6976844`): billing amount tampering, SSRF via
  IPv6-mapped literals, undeduplicated billing webhooks, unchecked upload
  MIME types.
- **Phase 1** (done, branch `phase-1-deployable`): Dockerfiles for both apps,
  `docker-compose.prod.yaml`, Caddy reverse proxy, S3/local storage driver,
  structured logging, `/health/ready`, graceful shutdown, GitHub Actions CI,
  deploy docs.

Everything below is grounded in the current codebase, checked on 2026-09-29 —
not carried over from the stale June 2025 plan.

---

## Phase 2: Org & Account Management (RBAC becomes real) — DONE 2026-09-29

**Goal:** `OrgRole` (`OWNER`/`ADMIN`/`MEMBER`) already existed and was enforced
on several routes, but signup always created a new org with the signer as
`OWNER`, so `ADMIN`/`MEMBER` could never exist.

- [x] Invites: `GET|POST /api/org/invites`, `DELETE /api/org/invites/:id`
      (OWNER invites ADMIN/MEMBER, ADMIN invites MEMBER; ownership only by
      role change). Re-inviting replaces the pending invite. Emailed via
      Resend when configured, otherwise the link is returned to the inviter.
- [x] Accept: `POST /api/invites/lookup` and `/accept`, token in the body
      (not the path, so it never lands in request logs). Creates the
      invitee's account in that org. Changed from the plan: an existing
      account elsewhere is not "attached" — users are per-org, so the
      invitee gets a separate account in the new org, and login asks for the
      org name when one password opens several.
- [x] Members: `GET /api/org/members`, `PATCH` (role, OWNER only),
      `DELETE` (OWNER, or ADMIN for MEMBERs). Last owner protected by a row
      lock on the org's OWNER rows. Removed users' forms pass to the remover.
- [x] `GET /api/auth/me`; the frontend refreshes its stored user from it on
      every page and signs out on 401.
- [x] Frontend: `/team`, `/account`, `/invite`, `/forgot-password`,
      `/reset-password`, `/verify-email`, header Team link and
      unconfirmed-email banner.
- [x] Password reset (1 h, single-use, SHA-256 stored, fragment links,
      60 s per-user cooldown, no account enumeration).
- [x] Email verification, soft gate (24 h links). Emailed invites count as
      confirmation; hand-shared invite links do not.
- [x] JWT revocation via `User.tokenVersion` (bumped on password change or
      reset and "sign out everywhere"); JWT algorithm pinned to HS256.

**Verified:** 115 backend unit tests; 74 API checks and 24 headless-browser
checks against a dev stack; the production Docker stack's smoke test now
invites and adds a teammate.

**Carry-over for Phase 4:** the auth rate limiter allows 10 failed attempts
per IP per 15 minutes; a Selenium suite running many negative scenarios from
one IP will need a test-only override.

---

## Phase 3: API Correctness & Hardening — DONE 2026-09-29

- [x] Zod validation on every route's params, query and body. Each route is
      declared once (`routes/*.routes.ts`) with its access rule and schemas;
      one builder turns that into the Express route (auth, role check,
      validation) and into the OpenAPI entry. 400s carry `issues` per field.
      Form schemas are validated as a whole (unique ids, select options,
      rules referencing real fields); submissions must be strings and only
      the form's own fields are stored.
- [x] Cursor pagination: forms (+ `/api/forms/summary` for dashboard
      totals), responses (+ total), webhook dead letters. CSV export streams
      in 1,000-row batches with backpressure.
- [x] Analytics entirely in SQL, no cap: funnel (views, starts,
      completions, abandoned, median time), true per-field drop-off from
      anonymous visit tracking (`FormSession`), skip rates with visibility
      rules compiled to SQL (randomised check: matches `isFieldVisible`
      exactly), daily series and weekday x hour heatmap in the viewer's
      time zone over 7/30/90 days. New analytics page built to the dataviz
      checks (validated palette, table views, keyboard tooltips).
- [x] OpenAPI 3.1 at `GET /api/openapi.json`, generated from the route
      declarations; Redocly lint: valid.

**Fixed along the way:** the dead-letter list/replay routes checked roles
without authenticating, so they always returned 403 (the resume's
"inspect and replay from the UI" did not work); `GET/POST /api/webhooks/:formId`
collided with `PATCH/DELETE /api/webhooks/:webhookId` (list/create now take
`formId` in the query/body); a non-string answer crashed submission with a
500; three list pages could be overwritten by a stale initial fetch.

**Verified:** 158 backend unit tests; 61 Phase 3 + 74 Phase 2 API checks;
16 headless-browser checks; production Docker stack smoke test.

**Carry-over:** `FormSession` rows grow with every visit; a retention job
(e.g. drop visits older than 180 days) belongs in Phase 5.

---

## Phase 4: Automated Test Suites — DONE 2026-09-30

- [x] Java 21 + Selenium 4.49 + Cucumber 8 suite in `e2e/`, Page Object
      Model, 35 scenarios across 8 features (auth, builder, responding,
      webhooks, team/RBAC, account security, analytics, billing), `@smoke`
      subset of 6. Maven wrapper, Selenium Manager for chromedriver.
      Setup through the API; the database only for what a test stack has
      no path for (Premium tier, failed deliveries, emailed link tokens).
      Failure screenshots + page text in the report and `target/failures`.
- [x] Runs headless in CI after the smoke test, on the production images
      with `docker-compose.e2e.yaml` (Postgres published for setup,
      `RATE_LIMIT_SCALE=100`); report kept as a CI artifact.
- [x] Backend integration tests (`npm run test:integration`, real Postgres
      and Redis, in CI): tenant isolation across every org-scoped endpoint,
      forged token claims, the scoped Prisma client. A planted scoping bug
      failed 10 of 26.
- [x] Frontend tests with Vitest + Testing Library (24): builder store and
      rule visibility, role helpers, API client errors, the auth page, the
      analytics charts.

**Found and fixed by the new tests:** visit-tracking SQL wrote `now()` in the
connection's time zone into UTC columns (funnel and abandonment skewed on any
non-UTC database); the builder wiped its "Form saved successfully." message
right after creating a form; the billing page offered members a Subscribe
button the API refuses.

**Verified:** 35/35 scenarios twice in a row against a production build of the
web app and the API; a planted last-owner bug failed the suite. The combined
Docker + browser run is first exercised by CI on push.

---

## Phase 5: Observability & Operational Hardening — DONE 2026-09-30

- [x] Frontend Sentry (`@sentry/nextjs`): browser, Next.js server and Edge,
      plus a `global-error.tsx` fallback page. Errors only; bodies, cookies,
      user details, query strings and URL fragments never sent (fragments
      carry invite/reset tokens). Verified against a local catcher: the
      error arrives, none of those do. `SENTRY_WEB_DSN` or `SENTRY_DSN`.
- [x] Audit log (`AuditLog` table): role changes, member removal, webhook
      create/edit/delete, subscription start/cancel, and Razorpay-driven
      tier changes (actor: Razorpay). Best-effort, never fails the action.
      `GET /api/org/audit-log` (owners/admins) and "Recent activity" on the
      Team page.
- [x] Alerting: README table of what to monitor (`/health/ready`,
      `/health/queues`, Sentry) and what a failure means. New
      `/health/queues` answers 503 when a queue's oldest job has waited
      more than 5 minutes, so a dead worker is visible (readiness can't see it).
- [x] Load test (`deploy/load-test.mjs`): respondent path handled ~2,760
      req/s with no errors (submit p99 120 ms). Found the bottleneck:
      webhook worker processed one job at a time (0.6 deliveries/s against
      a slow endpoint, blocking every tenant). Now 10 concurrent
      (`WEBHOOK_WORKER_CONCURRENCY`), 4.6/s on the same test.
- [x] FormSession retention: nightly BullMQ job deletes visits older than
      `FORM_SESSION_RETENTION_DAYS` (180); schedule stays single across
      restarts.

**Verified:** 161 backend unit, 35 integration, 31 frontend, 36/36 browser
scenarios; OpenAPI 48 operations; migration matches schema.

---

## Phase 6: Frontend Polish & Launch Readiness — IN PROGRESS

**Goal:** Close the remaining frontend gaps and do a final pass before a real
deploy.

Checked on 2026-10-02: the plan's "currently none" was out of date. Every page
already had loading text and an inline message; the real gaps were below.

- [x] Route-level `error.tsx` (inside the layout, reports to Sentry, retry)
      and `not-found.tsx`; `global-error.tsx` moved to `unstable_retry`
      (Next 16.2).
- [x] Toasts (`lib/toast.ts`, `<Toaster>` in the root layout, polite/
      assertive live regions) for row and background actions whose result
      was shown far from the button or not at all: dashboard enable/disable/
      delete, webhook add/test/enable/delete, dead-letter retry, copy
      failures, subscription cancelled, "load more" failures. Messages tied
      to a form being filled in stay next to it (and keep their test ids).
- [x] A failed first load no longer falls through to the empty state
      ("No forms yet", "No webhooks", Free plan): `LoadError` with Try again
      on dashboard, webhooks, responses, share, analytics, billing; team's
      member list no longer says "Loading…" forever.
- [x] Unreachable API reads "Couldn't reach Forma…" instead of "Failed to
      fetch"; all pages use the shared `errorMessage`.
- [x] Builder status green for a save, red for problems (was grey for both);
      webhooks form error red.
- [x] Billing: a failed status load offered a Premium org "Subscribe";
      double-click could start two checkouts; `payment.failed` had no
      feedback; the test-card note showed on live keys (status now returns
      `billingMode`); plan copy claimed Free analytics and Premium-only
      webhooks, neither true.
- [x] Webhook delete now confirms, like form delete.
- [ ] The builder's drag-and-drop is hand-rolled HTML5 drag events; it
      works, so this is optional polish (a library like `@dnd-kit` mainly
      buys touch-device support and easier reordering), not a blocker.
- [ ] Run `/security-review` on the full diff since Phase 0 as a final gate.
- [ ] A real deploy dry run on the target platform using Phase 1's
      Dockerfiles/compose, end to end, before calling it launched.
- [ ] Before real customers (not in the original plan): one live-mode
      Razorpay subscribe/cancel with webhooks reaching the public URL;
      scheduled off-host Postgres backups with one tested restore; Resend
      sending domain, S3/R2, Sentry DSNs set on the host.

**Deliverable:** Production-ready application, deployed once as a dry run.

---

## Summary Timeline

| Phase | Focus | Effort |
|---|---|---|
| 2 | Org & account management (RBAC becomes real, password reset, JWT revocation) | ~5–6 days |
| 3 | API correctness (Zod validation, pagination, analytics at scale) | ~1 week |
| 4 | Java Selenium+Cucumber suite, backend integration tests, frontend tests | ~1.5–2 weeks |
| 5 | Observability & ops hardening (audit log, alerting, load test) | ~3–4 days |
| 6 | Frontend polish & launch dry run | ~4–5 days |

**Total: ~4.5–5.5 weeks** for one developer. Phases 3 and 5 don't depend on
each other and could run in parallel with more bandwidth; Phase 4 (tests) can
start as soon as Phase 2's new endpoints exist, since it needs real
multi-role scenarios to test against.

## Open questions

1. Is the Java Selenium+Cucumber suite (Phase 4) actually required before
   "production ready," or is it separately required for a resume/assessment
   claim regardless of launch timing? That changes whether it's the next
   phase or can trail behind a Phase 2/3/6 launch.
2. Email verification: soft gate (Phase 2 as scoped) or hard block on
   unverified accounts?
3. Deployment target for the Phase 6 dry run — same host as Phase 1's
   Compose stack, or a container platform (Phase 1's README already covers
   both)?
