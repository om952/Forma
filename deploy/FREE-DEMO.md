# Free demo deployment: Vercel + Render + Neon

A public copy of Forma for showing in interviews, on free tiers only and with
no card needed:

| Piece | Where | Free-tier limit that matters |
| --- | --- | --- |
| Web app (Next.js) | Vercel Hobby | Non-commercial use only |
| API + queue workers | Render free web service | Sleeps after 15 idle minutes, ~1 min to wake |
| Redis (queues, rate limits) | Render free Key Value | 25 MB, emptied on restart |
| Postgres | Neon free | 0.5 GB, 100 compute-hours a month, sleeps after 5 idle minutes |

Not Render's own Postgres: its free database is deleted after 30 days.

`render.yaml` at the repo root defines the API and Redis; the steps below fill
in the rest. Allow about 45 minutes the first time.

## 1. Postgres on Neon

1. Sign up at neon.com and create a project. Region: **AWS Asia Pacific
   (Singapore)**, next to the Render region in `render.yaml`.
2. **Connect** → turn **Connection pooling off** → copy the connection string.
   It looks like
   `postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require`.
   Use the direct (unpooled) one: migrations run through it on every start.

## 2. API and Redis on Render

1. Sign up at render.com with GitHub and give it access to this repository.
2. **New → Blueprint** → pick the repository. Render reads `render.yaml` and
   asks for the values marked `sync: false`:
   - `DATABASE_URL`: the Neon string from step 1.
   - `PUBLIC_API_URL`: `https://forma-api.onrender.com`. If Render gives the
     service a different address (it adds a suffix when the name is taken),
     correct this afterwards under the service's **Environment**.
   - `FRONTEND_URL`: anything for now, e.g. `https://example.com`. Step 4 sets
     the real one.
   - Leave the Razorpay, Resend and Sentry ones empty.
3. **Apply**. The first build takes about five minutes. When it's live, open
   `https://<your-api>/health/ready`: it should say `"status":"ok"` with the
   database and Redis both ok.

## 3. Demo data

From your own checkout, against the Neon database:

```bash
cd backend
npm ci
DATABASE_URL='<the Neon string>' npm run seed:demo
```

This creates **Northwind Labs** (Premium) with four forms, ~460 responses over
three months, failed webhook deliveries, a pending invite and an activity log,
and prints the logins:

| Role | Email | Password |
| --- | --- | --- |
| Owner | `owner@forma.demo` | `forma-demo-2026` |
| Admin | `admin@forma.demo` | `forma-demo-2026` |
| Member | `member@forma.demo` | `forma-demo-2026` |

Running it again deletes and rebuilds only that organization, so it is also
how to reset the demo after people have changed things (or changed its
password). `DEMO_PASSWORD=...` picks a different password.

## 4. Web app on Vercel

1. Sign up at vercel.com with GitHub. **Add New → Project** → import this
   repository.
2. **Root Directory: `frontend`**. Framework preset: Next.js (detected).
3. Environment variables:
   - `NEXT_PUBLIC_API_BASE_URL` = `https://<your-api>.onrender.com`
   - `NEXT_PUBLIC_DEMO_EMAIL` = `owner@forma.demo`
   - `NEXT_PUBLIC_DEMO_PASSWORD` = `forma-demo-2026`

   The last two add **Explore the demo** to the home and sign-in pages. They
   are baked in at build time: change them, then redeploy.
4. **Deploy**, then copy the production URL (e.g. `https://forma-demo.vercel.app`).
5. Back on Render, set `FRONTEND_URL` to that URL and save. The API redeploys
   and from then on accepts requests from the web app. Only that URL works:
   Vercel's per-commit preview URLs are refused by CORS.

## 5. Keep the API awake

At uptimerobot.com (free), add an **HTTP(s)** monitor for
`https://<your-api>.onrender.com/health/live` every **5 minutes**.

Use `/health/live`, not `/health/ready`: it checks only that the API is up,
so the pings don't keep Neon's database awake and use up its 100 monthly
compute-hours. Render's own health check uses it for the same reason.

## Before an interview

- Open the site a couple of minutes early, in case the API was asleep.
- If the demo looks different from how you left it, re-run step 3.
- Have a fallback: a screen recording of the walkthrough below, and the
  Docker stack from the README on your laptop.

## A five-minute walkthrough

1. **Home → Explore the demo.** One click signs in as the owner.
2. **Dashboard.** Four forms, totals across them.
3. **Builder** (Customer Feedback). "What held you back?" carries a chip:
   *Shown when "Would you recommend…" is No* — conditional logic.
4. **Share → Open in a new tab.** Fill in the DevConf form as a *Student*: the
   college question appears only then. Submit.
5. **Responses.** The new submission is at the top.
6. **Analytics** (Customer Feedback, 90 days). Funnel from views to
   completions, which question people abandon at, and a weekday × hour heatmap,
   all computed in SQL.
7. **Webhooks** (DevConf). A few seconds after the submission, a new failed
   delivery appears: the CRM endpoint doesn't exist, so the worker retried it
   with backoff and parked it in the dead-letter queue. **Retry** puts it
   back in the queue.
8. **Team.** Owner, admin and member, a pending invite, and the activity log.
   Sign in as `member@forma.demo` in a private window: no Delete on forms, no
   team management — role checks on the API, not just hidden buttons.
9. **Plan gating.** Sign up a new organization: it starts on Free, analytics
   shows an upgrade prompt, and a fourth form is refused.

Points worth making: every query is scoped to the signed-in organization by a
Prisma client extension, and an integration suite points one organization at
another's records on every endpoint; webhooks go through BullMQ with retries
and a dead-letter queue; 36 Selenium + Cucumber scenarios run headless in CI
against the production Docker images.

## What's off on the free setup

- **Email.** Without `RESEND_API_KEY` nothing is sent: invite links are shown
  to the inviter to pass on, and password reset can't be used.
- **Payments.** Without Razorpay keys, **Subscribe** answers that billing
  isn't configured. To show checkout, add test-mode keys from a free Razorpay
  account to the three `RAZORPAY_*` variables, and point a Razorpay webhook at
  `https://<your-api>/api/payments/webhook`.
- **Uploads.** Files are kept on the API's disk, which Render clears on every
  restart or deploy. For lasting uploads, create a Cloudflare R2 bucket and set
  `STORAGE_DRIVER=s3`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID` and
  `S3_SECRET_ACCESS_KEY` on the API.
- **Queued jobs.** Redis is emptied when Render restarts it; a webhook
  delivery waiting at that moment is lost. Deliveries that already failed are
  in Postgres and survive.
