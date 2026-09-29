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
