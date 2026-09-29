# Forma

Forma is a multi-tenant B2B SaaS form builder with authentication, org-scoped data isolation, webhooks, analytics, and monetization. It is designed as a full-stack project that demonstrates real SaaS architecture patterns.

## What the platform does

- **Authentication + org isolation**: Users sign up/login and operate inside an organization. Every request is scoped to `orgId` for strict data isolation.
- **Teams and roles (RBAC)**: Owners and admins invite people by email at a role (`OWNER`, `ADMIN`, `MEMBER`). Owners change roles, admins remove members, and an organization always keeps at least one owner. Billing, webhooks and form deletion are limited to owners and admins.
- **Account security**: Password reset and email confirmation by one-time emailed links, password change, and "sign out of all devices". Sessions are revoked when a password changes or a member is removed.
- **Form builder**: Authenticated users build forms with a drag-and-drop style builder (text/select/file fields) and save schemas to the backend.
- **Public submissions**: Forms can be submitted publicly without JWT. Submissions are stored as responses tied to the form and org.
- **Webhook engine**: Each submission can trigger one or more webhooks through BullMQ + Redis, with retries and backoff. Deliveries that exhaust every retry land in a dead-letter table and can be inspected and replayed from the UI.
- **Email notifications**: Form owners are emailed on each submission, and respondents who supply an email address get a confirmation. Delivered through a separate BullMQ queue.
- **Analytics**: A start-to-completion funnel, per-field drop-off (where people who started the form gave up), per-field skip rates, daily submissions and a weekday-by-hour submission heatmap, over 7, 30 or 90 days in the viewer's time zone. Premium-only.
- **Monetization**: Free tier allows up to 3 forms. Premium unlocks unlimited forms and analytics. Razorpay handles payments and upgrades.

## Tech stack

**Frontend**
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Zustand

**Backend**
- Express.js
- TypeScript
- Prisma ORM
- PostgreSQL
- BullMQ + Redis
- JWT auth
- Razorpay

## Repository layout

```
/
├── backend/                   Express API and queue workers (one Docker image)
├── frontend/                  Next.js app
├── e2e/                       Browser tests: Java, Selenium, Cucumber
├── deploy/                    Caddyfile and the stack smoke test
├── docker-compose.yaml        Postgres and Redis for local development
├── docker-compose.prod.yaml   The whole stack on one host
├── docker-compose.e2e.yaml    Test override for the browser tests
└── .github/workflows/ci.yml   Tests, builds, smoke and browser tests
```

## Core flows

### 1) Signup / Login
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me` (JWT required)
Returns a JWT that includes `userId`, `orgId` and the user's token version.
The same email can have an account in several organizations; if one password
opens more than one, login asks for the organization name.

Every authenticated request re-reads the user, so a role change applies on
their next request, and a token whose version is stale is refused.

### 2) Create a form
- `POST /api/forms` (JWT required)
- `GET /api/forms?limit=&cursor=` returns a page of forms, newest first:
  `{ items, nextCursor }`. `GET /api/forms/summary` returns the dashboard
  totals.

The schema is validated as a whole: unique field ids, options on every select
field, and rules that belong to their target field and depend on another field
of the same form. If the org is on the FREE tier and already has 3 forms, the
request returns 403.

### 3) Submit a form (public)
- `POST /api/responses/:formId`: answers keyed by field id, all strings.
- `GET /api/responses/:formId?limit=&cursor=` returns
  `{ items, nextCursor, total }`.
- `GET /api/responses/:formId/export` streams every response as CSV, in
  batches.

Only the form's own fields are stored, and answers to fields hidden by a rule
are dropped. The response is then stored and its webhooks queued.

### 4) Webhook delivery
- `GET /api/webhooks?formId=`, `POST /api/webhooks` (`{ formId, url }`),
  `PATCH|DELETE /api/webhooks/:webhookId`
- A BullMQ worker pulls `webhook-deliveries` jobs from Redis and POSTs the
  payloads, retrying with exponential backoff.
- Deliveries that exhaust every retry go to a dead-letter table. Owners and
  admins can list them (`GET /api/webhooks/:formId/dead-letters`, paginated)
  and replay them.

### 5) Analytics (Premium)
- `GET /api/analytics/:formId?days=7|30|90&timeZone=Asia/Kolkata`

Everything is aggregated in Postgres, so results are exact at any volume.
Nothing is sampled or capped.
- **Funnel**: views, starts, completions, abandoned visits and median time to
  complete.
- **Per-field drop-off**: for each field, how many visitors reached it and how
  many left the form there.
- **Skip rate**: of the submissions that showed a field, the share that left
  it blank. Each form's visibility rules are compiled to SQL, so a hidden field
  doesn't count as skipped.
- **Daily series** and a **weekday × hour heatmap**, counted in the viewer's
  time zone.

The funnel and drop-off come from anonymous visit tracking on the public form
page. The page records `POST /api/forms/:id/sessions` when the form opens and
`POST /api/forms/:id/sessions/:sessionId/fields` the first time each field is
reached. The submission carries an `X-Form-Session` header, which links the
visit to its response. Tracking stores no IP address, user agent or answers. A
visit with no activity for 30 minutes and no submission counts as abandoned.

### 6) Payments and upgrade
- `POST /api/payments/create-subscription` (owner or admin)
- `POST /api/payments/cancel-subscription` (owner or admin)
- `GET /api/payments/status`
- `POST /api/payments/webhook` (Razorpay, HMAC-verified)
Subscription events from Razorpay move the org between FREE and PREMIUM. Each
event is recorded once, and one older than the state already applied is
ignored.

### 7) Team and invitations
- `GET /api/org/members` (any member)
- `PATCH /api/org/members/:userId` (owner): change role
- `DELETE /api/org/members/:userId` (owner, or admin for members): deletes
  the account; forms they created pass to whoever removed them
- `GET|POST /api/org/invites`, `DELETE /api/org/invites/:inviteId` (owner or
  admin)
- `POST /api/invites/lookup`, `POST /api/invites/accept` (public, token in the
  body)

Invitations expire after 7 days and work once. Re-inviting the same address
replaces the pending invitation. When email isn't configured, creating an
invitation returns the link for the inviter to share instead.

### 8) Account security
- `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`
- `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`
- `POST /api/auth/change-password`, `POST /api/auth/logout-all`

Emailed links carry their token in the URL fragment (`/reset-password#…`), so
it never reaches a server log, and the page posts it to the API. Only a
SHA-256 of each token is stored. Reset links last 1 hour, confirmation links 24
hours, and both work once. Resetting or changing a password signs out every
other session. Email confirmation is a soft gate: unconfirmed accounts work
and see a reminder.

## API reference

The server publishes an OpenAPI 3.1 description of every endpoint at
`GET /api/openapi.json`. Open it in any OpenAPI viewer, such as Swagger Editor
or Scalar.

Each route is declared once, in `backend/src/routes/*.routes.ts`, with its
access rule (public, any member, or specific roles) and its Zod schemas for the
path, query and body. The same declaration builds the Express route, including
authentication, the role check and validation, and generates its entry in the
document. The two can't drift apart.

Invalid input is refused with a 400 before reaching a handler:

```json
{
  "message": "schema.1.id: is used by another field",
  "requestId": "…",
  "issues": [{ "path": "schema.1.id", "message": "is used by another field" }]
}
```

List endpoints use cursor pagination: pass `nextCursor` back as `cursor` to get
the next page. `limit` defaults to 20 and is capped at 100.

## Local setup

### 1) Postgres and Redis

```bash
docker compose up -d
```

This runs Postgres on port 5434 and Redis on 6379, which match the defaults in
`backend/.env.example`. Redis is required: it holds the job queues and backs the
rate limiters. To use your own Postgres or Redis instead, change
`DATABASE_URL` and `REDIS_URL`.

### 2) Backend

```bash
cd backend
npm install
cp .env.example .env
```

`backend/.env.example` documents every setting. Its defaults work locally
as they are.

**Email is optional locally.** With `RESEND_API_KEY` unset, the notification
worker drains its queue instead of sending. Submissions, webhooks and
everything else work normally. Invitations return their link to the inviter.
In development the worker logs the confirmation and password-reset links it
would have sent, so you can follow them. Set the key to turn email on; no code
change is needed. `EMAIL_FROM` defaults to Resend's sandbox sender, which works
without verifying a domain. In production, password reset needs email.

Run migrations:

```bash
npx prisma migrate dev
```

Start the backend in development (runs TypeScript directly):

```bash
npm run dev
```

In development the queue workers (webhooks, emails) run inside the API process,
so that one command is enough.

For production, compile first and run the build — `npm start` does not
transpile. The workers are a separate process there, so the API and workers
scale and restart independently:

```bash
npm run build          # prisma generate + tsc -> dist/
npm start              # API:     node dist/server.js
npm run start:worker   # workers: node dist/worker.js
```

Configuration is validated at boot. Missing or invalid variables stop the
process with a list of exactly what is wrong rather than failing later on the
first request that needs them. With `NODE_ENV=production`, `JWT_SECRET` must
also be at least 32 characters and not one of the placeholder values.

The server drains on `SIGTERM`/`SIGINT`: it stops accepting connections, lets
in-flight requests and queue jobs finish, then closes Redis and the database
before exiting.

### 3) Frontend

```bash
cd frontend
npm install
```

Set frontend env:

```
NEXT_PUBLIC_API_BASE_URL="http://localhost:5001"
NEXT_PUBLIC_RAZORPAY_KEY_ID="your_key_id"
```

Start the frontend:

```bash
npm run dev
```

## URLs

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:5001`

## Deploying

### One host with Docker Compose

`docker-compose.prod.yaml` runs the whole stack on one machine:

```bash
cp .env.production.example .env.production   # set PUBLIC_URL, JWT_SECRET, POSTGRES_PASSWORD
docker compose --env-file .env.production -f docker-compose.prod.yaml up -d --build
```

The app is then on `http://localhost:8080`. Only the proxy publishes ports.

| Service    | What it does |
| ---------- | ------------ |
| `proxy`    | Caddy. Serves one origin: `/api` and `/health` go to the API (so do `/uploads` links saved before uploads moved to `/api/files`), everything else to the frontend. |
| `web`      | The Next.js standalone server. |
| `api`      | The Express API. Local uploads are kept on the `uploads` volume. |
| `worker`   | The BullMQ workers for webhooks and emails. |
| `migrate`  | Runs `prisma migrate deploy`, then exits. `api` and `worker` start only after it succeeds. |
| `postgres` | Data is kept on the `postgres_data` volume. |
| `redis`    | Append-only persistence and `noeviction`, so queued jobs survive restarts and are never evicted. |

**HTTPS.** Point a domain's DNS at the host and set
`SITE_ADDRESS=forms.example.com`, `HTTP_PORT=80`, `HTTPS_PORT=443` and
`PUBLIC_URL=https://forms.example.com`. Caddy obtains and renews the
certificate itself.

**Updating.** Run the same `up -d --build` after pulling. Pending migrations
are applied before the new API and worker start.

**Uploads.** `STORAGE_DRIVER=local` keeps files on a Docker volume on this
host. Use `STORAGE_DRIVER=s3` (S3, R2 or MinIO) once you run more than one API
container or host.

**Backups.** Postgres data lives in the `postgres_data` volume. For example:
`docker compose --env-file .env.production -f docker-compose.prod.yaml exec postgres pg_dump -U forma forma > backup.sql`.

**Operating it.**
- `GET /health/live` reports whether the process is up. `GET /health/ready`
  also checks Postgres and Redis. It returns 503 when either is unreachable,
  or while the instance drains during shutdown.
- Logs are JSON lines on stdout, one per request plus app events:
  `docker compose ... logs -f api worker`. Set `LOG_LEVEL` to change verbosity.
- Set `SENTRY_DSN` to report errors to Sentry. Images built with the
  `APP_RELEASE` build arg tag events with that version.
- `deploy/smoke-test.sh [base-url]` checks through the proxy that the API
  reference is served. It then signs up, builds a form, uploads a file, submits
  and reads back a response, and invites a teammate. It leaves that
  test data behind, so run it against a throwaway stack, not production.

### Other platforms

Both apps build from their own `Dockerfile`. The backend image has three roles,
chosen by the command:

- API: `node dist/server.js` (the default)
- workers: `node dist/worker.js`
- migrations: `npm run migrate:deploy`, run once per release before the others
  start

On a container platform (Render, Fly.io, Railway, ECS, …), run the API and the
workers as separate services from the same image. Set at least `NODE_ENV=production`,
`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PUBLIC_API_URL`, and
`CORS_ORIGINS` (the frontend's origin). Behind the platform's load balancer
also set `TRUST_PROXY=1`, and use `STORAGE_DRIVER=s3`, because container disks
are not persistent. The frontend reads the API origin from the
`NEXT_PUBLIC_API_BASE_URL` build arg. Leave it empty only when a proxy serves
the API under `/api` on the frontend's own origin, as in the Compose setup.

## Testing

| Suite | Command | What it covers |
| --- | --- | --- |
| Backend unit | `cd backend && npm test` | Role rules, validation schemas, token helpers, analytics SQL builders, pagination, SSRF guard, billing events, the OpenAPI builder. No database needed. |
| Backend integration | `cd backend && npm run test:integration` | The real app on a real Postgres and Redis. Tenant isolation: a signed-in org aims every org-scoped endpoint at another org's records and must get a 404, with nothing changed. Also forged token claims and the scoped database client. Needs `DATABASE_URL`, `REDIS_URL` and `JWT_SECRET`, and migrations applied. |
| Frontend | `cd frontend && npm test` | Vitest and Testing Library: the builder's form and rule logic, the role helpers, the API client's error handling, the sign-in page, and the analytics charts. |
| Browser (E2E) | `cd e2e && ./mvnw test` | Java, Selenium and Cucumber, using the Page Object Model: 35 scenarios through the real UI, covering auth, the builder, responding, webhooks, team roles, account security, analytics and billing. See [e2e/README.md](e2e/README.md). |

`RATE_LIMIT_SCALE` multiplies every rate limit, so a suite driving the whole
app from one machine isn't throttled. `docker-compose.e2e.yaml` sets it for
the browser tests. Leave it at 1 in production; the server warns at startup
when it isn't.

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- **Backend**:
  - typecheck, unit tests and build
  - applies every migration to an empty Postgres, and fails if `schema.prisma`
    has changes that no migration covers
  - runs the integration tests against that Postgres and a Redis
- **Frontend**: lint, unit and component tests, and the production build.
- **Docker stack and browser tests**:
  - builds both images and starts the production stack with the test override
  - runs `deploy/smoke-test.sh`, then the Selenium and Cucumber suite in
    headless Chrome
  - keeps the Cucumber report and any failure screenshots as the
    `browser-test-report` artifact

## Notes

- The auth page stores the JWT in local storage and uses it for protected calls.
- The builder and analytics pages use the stored token automatically.
- Free tier limits form creation to 3 forms per org.

## License

MIT (or update as needed).
