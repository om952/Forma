# Forma — Phase-wise Implementation Plan

**Project:** Forma (Multi-Tenant SaaS Form Builder)  
**Current Status:** ~35-40% complete (working prototype, happy-path only)  
**Goal:** Production-ready SaaS with full feature set described in project brief  
**Date:** 2025-06-27  

---

## Phase 0: Foundation Hardening (Week 1)
**Goal:** Fix gaps in existing code before building on top of shaky ground.

### 0.1 Environment & Config Audit
- [ ] Audit `.env` files — ensure all required vars documented
- [ ] Add `backend/.env.example` with all required keys
- [ ] Add `frontend/.env.local.example`
- [ ] Verify Docker Compose for PostgreSQL + Redis (or document local setup)

### 0.2 Backend API Completeness
- [ ] **Form CRUD endpoints** (currently only `POST /api/forms` exists)
  - `GET /api/forms` — list org forms
  - `GET /api/forms/:id` — get single form with schema
  - `PATCH /api/forms/:id` — update form schema/name/isActive
  - `DELETE /api/forms/:id` — soft or hard delete
- [ ] **Response endpoints**
  - `GET /api/forms/:id/responses` — list submissions (paginated)
  - `GET /api/responses/:id` — single response
- [ ] **Webhook management endpoints**
  - `POST /api/forms/:id/webhooks` — create webhook
  - `GET /api/forms/:id/webhooks` — list webhooks
  - `DELETE /api/webhooks/:id` — remove webhook
- [ ] **User/Org endpoints**
  - `GET /api/auth/me` — current user + org
  - `GET /api/org/members` — list org members (ADMIN+ only)
  - `DELETE /api/org/members/:id` — remove member (ADMIN+ only)

### 0.3 Frontend Foundation
- [ ] Add `react-query` or `swr` for server state management
- [ ] Add `react-hook-form` or keep Zustand — decide and document
- [ ] Add proper error boundaries and loading states
- [ ] Add toast/notification system

### 0.4 Testing Skeleton
- [ ] Add `vitest` to frontend
- [ ] Add `jest` or `vitest` to backend
- [ ] Write at least one integration test per controller

**Deliverable:** All CRUD APIs working, frontend has data-fetching layer, tests pass.  
**API Keys needed:** None (uses existing DB/Redis).  
**Review Point:** Pause for code review + merge before Phase 1.

---

## Phase 1: Form Builder Core (Week 2)
**Goal:** Make the form builder actually usable — drag-drop, field editing, conditional logic.

### 1.1 Backend — Schema Validation & Logic
- [ ] Add Zod schema validation for form schemas (field types, options, rules)
- [ ] Add `conditionalLogic` JSON field to Form model (or store in schema)
- [ ] Add endpoint to validate form schema before save
- [ ] Add endpoint to evaluate conditional logic server-side (for public submissions)

### 1.2 Frontend — Real Drag-and-Drop Builder
- [ ] Integrate `@dnd-kit/core` or `react-beautiful-dnd` for field reordering
- [ ] Build field palette sidebar (text, select, file, number, textarea, checkbox, radio, date)
- [ ] Build field property inspector (edit label, placeholder, required, options, validation rules)
- [ ] Live preview updates as fields are edited
- [ ] Save/load form schema from backend

### 1.3 Conditional Logic Builder
- [ ] UI to add "show/hide" rules per field
- [ ] Rule editor: "if field X equals Y, show field Z"
- [ ] Store rules in form schema
- [ ] Live preview respects rules

**Deliverable:** User can build a multi-field form with drag-drop, edit properties, set conditional visibility, and save.  
**API Keys needed:** None.  
**Review Point:** Demo the builder end-to-end before Phase 2.

---

## Phase 2: Public Form & Submissions (Week 3)
**Goal:** Forms can be shared and filled by non-authenticated users.

### 2.1 Public Form View
- [ ] New Next.js route: `/f/:formSlug` or `/form/:formId`
- [ ] Fetch form schema public API (no auth required, only if `isActive`)
- [ ] Render form dynamically from schema
- [ ] Apply conditional logic client-side
- [ ] Handle file uploads (see Phase 2.3)

### 2.2 Submission Handling
- [ ] `POST /api/forms/:id/submit` — public endpoint (already partially exists)
- [ ] Server-side schema validation on submit
- [ ] Server-side conditional logic evaluation
- [ ] Rate limiting (per IP per form)
- [ ] Spam protection (honeypot or reCAPTCHA)

### 2.3 File Uploads
- [ ] **Decision needed:** Cloud storage provider
  - **Option A:** AWS S3 (requires AWS access key + bucket)
  - **Option B:** Cloudflare R2 (requires account ID + API token)
  - **Option C:** Supabase Storage (requires Supabase project)
  - **Option D:** Local disk storage (dev only, not production)
- [ ] Backend: Generate presigned URLs for direct upload
- [ ] Frontend: Upload file before submitting form, attach URL to payload
- [ ] Store file metadata in response payload

### 2.4 Response Management
- [ ] Frontend: Response list page per form
- [ ] Frontend: Individual response detail view
- [ ] Export responses to CSV/JSON
- [ ] Basic filtering (date range, field values)

**Deliverable:** Public forms work, file uploads functional, responses viewable and exportable.  
**API Keys needed:** Cloud storage provider (S3/R2/Supabase) — **TELL ME WHICH YOU PREFER**.  
**Review Point:** Test public form submission + file upload flow.

---

## Phase 3: Webhooks & Integrations (Week 4)
**Goal:** Production-ready webhook pipeline with management UI.

### 3.1 Webhook Management UI
- [ ] Frontend: Add webhooks per form (URL, events, headers)
- [ ] Frontend: Webhook delivery log (status, retries, last attempt)
- [ ] Backend: Webhook CRUD endpoints (from Phase 0)
- [ ] Backend: Webhook event types (submission.created, form.updated, etc.)

### 3.2 Dead Letter Queue & Retries
- [ ] Improve worker: exponential backoff with jitter
- [ ] Add DLQ — after 3 failures, move to dead-letter queue
- [ ] Add endpoint to retry failed webhooks
- [ ] Add endpoint to list failed deliveries

### 3.3 Pre-built Integrations
- [ ] Slack webhook template (format payload for Slack incoming webhooks)
- [ ] Zapier webhook template
- [ ] Test webhook button (send sample payload)

**Deliverable:** Users can configure webhooks, see delivery logs, retry failures.  
**API Keys needed:** None (Slack/Zapier use user's own webhooks).  
**Review Point:** Test webhook delivery to Slack + Zapier.

---

## Phase 4: Analytics Dashboard (Week 5)
**Goal:** Rich analytics with heatmaps, drop-off rates, and insights.

### 4.1 Backend Analytics
- [ ] Per-field analytics: views, starts, completions, drop-off
- [ ] Heatmap data: which fields take longest, where users abandon
- [ ] Submission trends: hourly, daily, weekly
- [ ] Device/browser analytics (from user-agent)
- [ ] Geographic analytics (from IP — requires GeoIP DB or service)

### 4.2 Frontend Analytics
- [ ] Recharts or Tremor charts for all metrics
- [ ] Funnel visualization (started → completed)
- [ ] Field-level drop-off bar chart
- [ ] Time-series line chart for submissions
- [ ] Heatmap overlay on form preview (optional, complex)

### 4.3 Premium Analytics Gating
- [ ] Free tier: basic counts only (7-day series)
- [ ] Premium: full analytics, heatmaps, exports
- [ ] Enforce in backend + frontend

**Deliverable:** Analytics page shows meaningful insights, premium gating works.  
**API Keys needed:** None (GeoIP optional — **TELL ME IF YOU WANT IT**).  
**Review Point:** Review analytics accuracy with test data.

---

## Phase 5: Billing & Subscriptions (Week 6)
**Goal:** Complete Razorpay integration with plan management.

### 5.1 Plan Management
- [ ] Define plan features matrix (FREE vs PREMIUM vs ENTERPRISE)
- [ ] Store plan limits in config/code
- [ ] Enforce limits across all endpoints (forms, responses, webhooks, analytics)
- [ ] Add `plan` table or keep as enum — decide based on future plans

### 5.2 Razorpay Subscriptions
- [ ] Create subscription plans in Razorpay dashboard
- [ ] `POST /api/payments/create-subscription` (vs one-time order)
- [ ] Handle subscription webhooks (activated, charged, cancelled, expired)
- [ ] Update org tier on subscription events
- [ ] Grace period handling

### 5.3 Billing UI
- [ ] Pricing page
- [ ] Current plan display
- [ ] Upgrade/downgrade flow
- [ ] Invoice history (fetch from Razorpay)

**Deliverable:** Complete subscription billing, plan enforcement, upgrade flow.  
**API Keys needed:** Razorpay test/live credentials (key ID, key secret, webhook secret) — **YOU ALREADY HAVE THESE IN .env**.  
**Review Point:** Test subscription flow with Razorpay test mode.

---

## Phase 6: RBAC & Organization Management (Week 7)
**Goal:** Proper role-based access control and org admin features.

### 6.1 RBAC Enforcement
- [ ] Middleware: `requireRole(roles: OrgRole[])`
- [ ] Gate endpoints:
  - Only OWNER/ADMIN can manage webhooks
  - Only OWNER can delete org, manage billing
  - MEMBER can create forms, view responses
- [ ] Frontend: Hide/show UI based on role

### 6.2 Organization Management
- [ ] Invite members by email (send invite link)
- [ ] Accept invite flow
- [ ] Remove members
- [ ] Transfer ownership
- [ ] Org settings (name, slug — slug change with caution)

### 6.3 Multi-org Support (Optional)
- [ ] User can belong to multiple orgs
- [ ] Switch org UI
- [ ] JWT includes active org, switch endpoint

**Deliverable:** Role-based permissions enforced, org management functional.  
**API Keys needed:** Email service for invites (SendGrid/Resend/AWS SES) — **TELL ME IF YOU WANT INVITES NOW OR LATER**.  
**Review Point:** Test role-based access with different user types.

---

## Phase 7: Polish & Production Readiness (Week 8)
**Goal:** Deployable, monitored, documented SaaS.

### 7.1 Performance
- [ ] Add Redis caching for form schemas (public forms)
- [ ] Add response pagination (cursor-based for large forms)
- [ ] Database indexing review
- [ ] Add connection pooling config

### 7.2 Security
- [ ] Rate limiting on all public endpoints (express-rate-limit)
- [ ] CORS review
- [ ] Helmet config review
- [ ] Input sanitization (XSS prevention)
- [ ] Audit log for sensitive operations

### 7.3 Monitoring
- [ ] Add structured logging (Pino or Winston)
- [ ] Health check endpoint expansion
- [ ] Add metrics endpoint (Prometheus format)
- [ ] Error tracking (Sentry) — **TELL ME IF YOU WANT SENTRY**

### 7.4 Deployment
- [ ] Dockerize backend + frontend
- [ ] Docker Compose for full stack
- [ ] Environment-specific config
- [ ] Database migration strategy
- [ ] CI/CD pipeline (GitHub Actions) — **TELL ME IF YOU WANT THIS**

### 7.5 Documentation
- [ ] API documentation (OpenAPI/Swagger)
- [ ] README with setup instructions
- [ ] Environment variable documentation
- [ ] Deployment guide

**Deliverable:** Production-ready application, deployable with Docker.  
**API Keys needed:** Sentry DSN (optional), deployment platform credentials (optional).  
**Review Point:** Final demo + deployment test.

---

## Summary Timeline

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| 0 | Week 1 | Foundation: CRUD APIs, testing skeleton |
| 1 | Week 2 | Form builder with DnD + conditional logic |
| 2 | Week 3 | Public forms + file uploads + submissions |
| 3 | Week 4 | Webhook management + delivery logs |
| 4 | Week 5 | Analytics dashboard |
| 5 | Week 6 | Subscription billing |
| 6 | Week 7 | RBAC + org management |
| 7 | Week 8 | Production polish + deployment |

**Total: ~8 weeks** (can parallelize some phases if you have bandwidth)

---

## Open Questions / Decisions Needed

1. **File storage:** Which provider? (S3 / R2 / Supabase / local)
2. **Email service:** Need invite emails? (SendGrid / Resend / SES / skip for now)
3. **Error tracking:** Add Sentry? (yes/no)
4. **CI/CD:** Add GitHub Actions for auto-deploy? (yes/no)
5. **GeoIP:** Add geographic analytics? (yes/no)
6. **Deployment target:** Vercel + Railway / AWS / self-hosted? (decide before Phase 7)

---

## Immediate Next Steps

1. **Review this plan** — tell me if you want to adjust phases, parallelize, or cut scope
2. **Answer the 6 questions above** so I can configure the right services
3. **Decide if we start Phase 0 now** or jump to a specific phase
