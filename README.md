# Forma

Forma is a multi-tenant B2B SaaS form builder with authentication, org-scoped data isolation, webhooks, analytics, and monetization. It is designed as a full-stack project that demonstrates real SaaS architecture patterns.

## What the platform does

- **Authentication + org isolation**: Users sign up/login and operate inside an organization. Every request is scoped to `orgId` for strict data isolation.
- **Form builder**: Authenticated users build forms with a drag-and-drop style builder (text/select/file fields) and save schemas to the backend.
- **Public submissions**: Forms can be submitted publicly without JWT. Submissions are stored as responses tied to the form and org.
- **Webhook engine**: Each submission can trigger one or more webhooks through BullMQ + Redis, with retries and backoff.
- **Analytics**: View response totals and daily submission counts for the last 7 days.
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
├── backend/
└── frontend/
```

## Core flows

### 1) Signup / Login
- `POST /api/auth/signup`
- `POST /api/auth/login`
Returns a JWT that includes `userId` and `orgId`.

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
- `POST /api/payments/create-order` (JWT required)
- `POST /api/payments/webhook` (Razorpay)
On successful payment, org tier is upgraded to PREMIUM.

## Local setup

### 1) Backend

```bash
cd backend
npm install
```

Create a `.env` file based on your local setup:

```
DATABASE_URL="postgresql://postgres:password@localhost:5432/forma_db?schema=public"
PORT=5001
JWT_SECRET="your_jwt_secret"
BCRYPT_SALT_ROUNDS=12
RAZORPAY_KEY_ID="your_key_id"
RAZORPAY_KEY_SECRET="your_key_secret"
RAZORPAY_WEBHOOK_SECRET="your_webhook_secret"
REDIS_URL="redis://127.0.0.1:6379"
```

Run migrations:

```bash
npx prisma migrate dev
```

Start the backend:

```bash
npm run dev
```

### 2) Redis (for webhooks)

```bash
brew install redis
brew services start redis
```

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

## Notes

- The auth page stores the JWT in local storage and uses it for protected calls.
- The builder and analytics pages use the stored token automatically.
- Free tier limits form creation to 3 forms per org.

## License

MIT (or update as needed).
