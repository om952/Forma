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
- **Analytics**: View response totals and daily submission counts for the last 7 days, plus per-field drop-off rates and a submission heatmap. Premium-only.
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
├── deploy/                    Caddyfile and the stack smoke test
├── docker-compose.yaml        Postgres and Redis for local development
├── docker-compose.prod.yaml   The whole stack on one host
└── .github/workflows/ci.yml   Tests, builds and a smoke test of the stack
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
If org tier is FREE and already has 3 forms, returns 403.

### 3) Submit a form (public)
- `POST /api/responses/:formId`
Stores the response and queues webhooks.

### 4) Webhook delivery
- BullMQ worker pulls `webhook-deliveries` jobs from Redis and POSTs payloads.
- Retries are enabled with exponential backoff.

### 5) Analytics
- `GET /api/analytics/:formId` (JWT required)
Returns total responses and a 7-day daily series.

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
- `deploy/smoke-test.sh [base-url]` signs up, builds a form, uploads a file,
  and submits and reads back a response through the proxy. It leaves that
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

## CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

- **Backend**: typecheck, unit tests and build. It also applies every
  migration to an empty Postgres and fails if `schema.prisma` has changes
  that no migration covers.
- **Frontend**: lint and production build.
- **Docker stack**: builds both images, starts `docker-compose.prod.yaml` and
  runs `deploy/smoke-test.sh` against it.

## Notes

- The auth page stores the JWT in local storage and uses it for protected calls.
- The builder and analytics pages use the stored token automatically.
- Free tier limits form creation to 3 forms per org.

## License

MIT (or update as needed).
