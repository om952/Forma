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

## Phase 2: Org & Account Management (RBAC becomes real)

**Goal:** `OrgRole` (`OWNER`/`ADMIN`/`MEMBER`) already exists in the schema and
is enforced on several routes, but signup always creates a brand-new org with
the signer as `OWNER` — there is no way to add a second user to an org, so
`ADMIN`/`MEMBER` can never exist and RBAC is unreachable in practice.

- [ ] `POST /api/org/invites` (OWNER/ADMIN) — create an invite (email + role),
      send it via the existing Resend integration.
- [ ] `POST /api/org/invites/:token/accept` — creates the user in that org
      with the invited role, or attaches an existing account.
- [ ] `GET /api/org/members`, `PATCH /api/org/members/:id` (role change),
      `DELETE /api/org/members/:id` (OWNER/ADMIN only; an OWNER can't remove
      the last OWNER).
- [ ] `GET /api/auth/me` — current user + org + role, so the frontend stops
      trusting whatever it decoded from the JWT client-side.
- [ ] Frontend: an org settings / members page using the above.
- [ ] Password reset: `POST /api/auth/forgot-password`,
      `POST /api/auth/reset-password/:token`, emailed via Resend, tokens
      hashed at rest and short-lived.
- [ ] Email verification on signup (soft gate — unverified accounts work but
      are flagged; don't block launch on a hard gate).
- [ ] JWT revocation: add a `tokenVersion` on `User`, embed it in the JWT,
      bump it on password change and on an explicit "log out everywhere."

**Deliverable:** A second person can be invited into an org at a role other
than OWNER, and RBAC checks are exercised by more than one account.
**Effort:** ~5–6 days.
**Review point:** Security review of the invite-accept and password-reset
token handling before merging (token reuse, expiry, enumeration).

---

## Phase 3: API Correctness & Hardening

**Goal:** Close the gaps the audits flagged in request handling and
analytics.

- [ ] Zod validation on every controller's request body/params/query.
      `zod` is already a dependency and used in `config/env.ts`; nothing in
      `src/controllers` uses it yet.
- [ ] Pagination: `GET /api/forms`, `GET /api/responses/:formId`, and the
      webhook dead-letter list — cursor or page+limit, capped page size.
- [ ] Analytics: `analytics.controller.ts:72` caps at `take: 1000` and
      aggregates in memory — move to SQL `groupBy`/raw aggregation so it's
      correct past 1,000 responses.
- [ ] Analytics: the "heatmap" is a per-field view-count grid, not a time
      heatmap — decide whether to build a real day×hour heatmap or rename
      the feature; either way, track form *views* and *starts* (not just
      completions) so drop-off/abandonment is measurable, not just
      per-field blank rate among submitters.
- [ ] OpenAPI spec (generated from the Zod schemas above, or hand-written) —
      also closes the "no API docs" gap.

**Deliverable:** Bad input gets a 400 with a clear message instead of a 500
or silent wrong behavior; list endpoints don't degrade as data grows;
analytics numbers are correct at any response count.
**Effort:** ~1 week.

---

## Phase 4: Automated Test Suites

**Goal:** This is the biggest gap against the project's own claims — 0% built
so far — and the thing most likely to be checked directly.

- [ ] Java + Selenium + Cucumber suite, Page Object Model, 25+ scenarios
      across: auth (signup/login/invalid creds), form builder (create,
      field types, conditional rules, save), public submission (valid,
      validation errors, file upload), webhooks (create, test, dead-letter
      replay), billing (upgrade/downgrade gating), RBAC (member vs.
      admin vs. owner actions).
- [ ] Headless Chrome (or Chromium) in CI — a `.github/workflows` job
      separate from the Node CI added in Phase 1, since it's a different
      toolchain (Maven/Gradle + JDK).
- [ ] Backend integration tests against a real Postgres (the 82 unit tests
      added in Phase 0/1 mock or use pure functions; none hit a live DB
      through Prisma) — org-isolation is the highest-value target here,
      since `scopedPrisma.ts` currently has unit tests but nothing that
      actually tries to read another org's data end-to-end.
- [ ] Frontend component tests (currently zero) — at minimum the builder's
      schema/rule logic and the auth forms.

**Deliverable:** `mvn test` (or equivalent) runs the Selenium/Cucumber suite
headless in CI on every PR, backend integration tests catch cross-org leaks,
and the frontend has some test coverage.
**Effort:** ~1.5–2 weeks — the largest single phase.

---

## Phase 5: Observability & Operational Hardening

**Goal:** Phase 1 covers the basics (structured logs, `/health/ready`,
graceful shutdown, optional Sentry). This phase is what's needed to actually
run the thing and know when it's broken.

- [ ] Confirm Sentry is wired on the frontend too, not just the backend
      (`SENTRY_DSN` currently only appears in the backend config).
- [ ] Audit log for sensitive actions: role changes, billing changes,
      webhook create/edit/delete, member removal — a simple table, not a
      new subsystem.
- [ ] Alerting: at minimum, a documented way to get paged when
      `/health/ready` goes red (most platforms' built-in health-check
      alerting is enough — this is a docs/config task, not new code).
- [ ] Load-test the submission and webhook-delivery paths once, to catch
      an obvious bottleneck before it's a production incident.

**Deliverable:** Someone other than the person who wrote the code could be
on call for this.
**Effort:** ~3–4 days.

---

## Phase 6: Frontend Polish & Launch Readiness

**Goal:** Close the remaining frontend gaps and do a final pass before a real
deploy.

- [ ] Error boundaries and consistent loading/error states (currently none;
      failed requests likely fail silently or throw to the console).
- [ ] Toast/notification system for actions (save, invite sent, webhook
      test result, etc.) — currently none.
- [ ] The builder's drag-and-drop is hand-rolled HTML5 drag events; it
      works, so this is optional polish (a library like `@dnd-kit` mainly
      buys touch-device support and easier reordering), not a blocker.
- [ ] Run `/security-review` on the full diff since Phase 0 as a final gate.
- [ ] A real deploy dry run on the target platform using Phase 1's
      Dockerfiles/compose, end to end, before calling it launched.

**Deliverable:** Production-ready application, deployed once as a dry run.
**Effort:** ~4–5 days.

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
