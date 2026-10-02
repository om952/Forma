/**
 * Creates (or rebuilds) the demo organization: a Premium org with an owner,
 * an admin and a member, four forms, ~90 days of responses and visits (so the
 * funnel, drop-off, skip rates, daily series and heatmap all have something to
 * show), webhooks with failed deliveries to retry, a pending invite and an
 * activity log.
 *
 *   DATABASE_URL=... npm run seed:demo            (from a checkout)
 *   node dist/scripts/seedDemo.js                 (inside the API image)
 *
 * Only the organization with the demo slug is touched: it is deleted and
 * recreated, so running this again resets the demo after people have used it.
 * Answers and timings come from a fixed random seed, so every run looks the same.
 *
 * Deliberately does not import config/env: seeding needs a database, not a
 * JWT secret or Redis.
 */
import "dotenv/config";

import { createHash, randomBytes, randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { type OrgRole, type Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { Pool } from "pg";

import type { FormField } from "../types/formSchema";
import { isFieldVisible } from "../types/formSchema";

const ORG_NAME = "Northwind Labs";
const ORG_SLUG = "northwind-labs";
const PASSWORD = process.env.DEMO_PASSWORD || "forma-demo-2026";
const DAYS = 90;
/** Respondents are mostly in India: hours are drawn in IST, then stored as UTC. */
const IST_OFFSET_MINUTES = 330;

const USERS: Array<{ key: string; email: string; name: string; role: OrgRole }> = [
  { key: "owner", email: "owner@forma.demo", name: "Riya Kapoor", role: "OWNER" },
  { key: "admin", email: "admin@forma.demo", name: "Arjun Mehta", role: "ADMIN" },
  { key: "member", email: "member@forma.demo", name: "Sara Thomas", role: "MEMBER" },
];

// ---- deterministic randomness ------------------------------------------------

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const random = mulberry32(20261002);
const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
const chance = (p: number) => random() < p;

/** Picks an item with the given relative weights. */
const weighted = <T>(items: ReadonlyArray<readonly [T, number]>): T => {
  const total = items.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [item, weight] of items) {
    roll -= weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1]![0];
};

// Busy on weekday working hours, quieter evenings and weekends: a heatmap with a shape.
const HOUR_WEIGHTS = [
  1, 0, 0, 0, 0, 1, 2, 4, 7, 11, 14, 15, 13, 12, 14, 13, 11, 9, 8, 9, 8, 6, 4, 2,
].map((weight, hour) => [hour, weight] as const);

/**
 * A submission time within the last `days` days (from `minDaysAgo`), more
 * likely recent when `recentBias` > 1, on weekdays, and in IST working hours.
 */
const submissionTime = (now: Date, days: number, recentBias = 1.6, minDaysAgo = 0): Date => {
  for (;;) {
    const daysAgo = minDaysAgo + Math.floor(Math.pow(random(), recentBias) * (days - minDaysAgo));
    const day = new Date(now.getTime() - daysAgo * 86_400_000);
    const weekday = new Date(day.getTime() + IST_OFFSET_MINUTES * 60_000).getUTCDay();
    if ((weekday === 0 || weekday === 6) && chance(0.55)) continue;

    const hour = weighted(HOUR_WEIGHTS);
    const istMidnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const at = new Date(
      istMidnight - IST_OFFSET_MINUTES * 60_000 + (hour * 60 + int(0, 59)) * 60_000 + int(0, 59) * 1000
    );
    // Nothing in the future, and nothing so recent it can't count as abandoned yet.
    if (at.getTime() < now.getTime() - 60 * 60_000) return at;
  }
};

// ---- people ---------------------------------------------------------------------

const FIRST_NAMES = [
  "Aarav", "Ananya", "Vihaan", "Diya", "Ishaan", "Meera", "Kabir", "Saanvi", "Rohan", "Priya",
  "Aditya", "Kavya", "Nikhil", "Tanvi", "Rahul", "Neha", "Siddharth", "Pooja", "Karan", "Aisha",
  "Daniel", "Emma", "Lucas", "Sofia", "Omar", "Lena", "Hiro", "Mei", "Carlos", "Zara",
] as const;
const LAST_NAMES = [
  "Sharma", "Iyer", "Reddy", "Nair", "Gupta", "Patel", "Singh", "Das", "Menon", "Joshi",
  "Kulkarni", "Bose", "Chopra", "Rao", "Verma", "Fernandes", "Khan", "Pillai", "Shah", "Bhat",
  "Miller", "Garcia", "Tanaka", "Chen", "Haddad", "Novak", "Silva", "Okafor",
] as const;
const DOMAINS = ["gmail.com", "outlook.com", "yahoo.in", "proton.me", "northwind.example"] as const;

const person = () => {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const email = `${first}.${last}${chance(0.4) ? int(1, 99) : ""}@${pick(DOMAINS)}`.toLowerCase();
  return { name: `${first} ${last}`, email };
};

// ---- forms ----------------------------------------------------------------------

type Answers = Record<string, string>;

type FormSpec = {
  name: string;
  thankYouMessage: string;
  isActive: boolean;
  schema: FormField[];
  /** Completed submissions to create. */
  responses: number;
  /** Visits that never touched a field, per submission. */
  bounceRate: number;
  /** Visits that started but were left, per submission. */
  abandonRate: number;
  /** Where abandoned visits stopped, by field id. */
  dropOff: ReadonlyArray<readonly [string, number]>;
  timing: { days: number; recentBias: number; minDaysAgo?: number };
  answer: () => Answers;
  /** Seconds a respondent spends from first field to submit. */
  seconds: [number, number];
};

const rule = (id: string, ifFieldId: string, value: string, targetFieldId: string) => ({
  id,
  ifFieldId,
  operator: "equals" as const,
  value,
  action: "show" as const,
  targetFieldId,
});

const FEEDBACK_IMPROVEMENTS = [
  "Pricing for small teams is a bit steep.",
  "We needed SSO before rolling it out.",
  "The builder felt slow on our older laptops.",
  "Missing a Google Sheets integration.",
  "Hard to find the export button at first.",
] as const;
const FEATURE_REQUESTS = [
  "Multi-page forms with a progress bar",
  "Payment fields",
  "A Google Sheets sync",
  "Scheduled form closing",
  "Answer piping into later questions",
  "Templates for common surveys",
  "",
  "",
] as const;

const feedback: FormSpec = {
  name: "Customer Feedback — Q3",
  thankYouMessage: "Thanks! Every answer is read by the product team.",
  isActive: true,
  responses: 214,
  bounceRate: 0.55,
  abandonRate: 0.22,
  dropOff: [
    ["fb_reason", 5],
    ["fb_feature", 4],
    ["fb_rating", 2],
    ["fb_email", 1],
  ],
  timing: { days: DAYS, recentBias: 1.5 },
  seconds: [45, 260],
  schema: [
    { id: "fb_name", type: "text", label: "Your name", required: true },
    { id: "fb_email", type: "email", label: "Work email", required: true },
    { id: "fb_plan", type: "select", label: "Which plan are you on?", required: true, options: ["Free", "Premium"] },
    {
      id: "fb_rating",
      type: "select",
      label: "How would you rate Forma overall?",
      required: true,
      options: ["Excellent", "Good", "Okay", "Poor"],
    },
    {
      id: "fb_recommend",
      type: "select",
      label: "Would you recommend Forma to a colleague?",
      required: true,
      options: ["Yes", "No"],
    },
    {
      id: "fb_reason",
      type: "textarea",
      label: "What held you back?",
      required: true,
      rules: [rule("fb_rule_reason", "fb_recommend", "No", "fb_reason")],
    },
    { id: "fb_feature", type: "textarea", label: "What should we build next?", required: false },
    { id: "fb_followup", type: "checkbox", label: "You can contact me about my answers", required: false },
  ],
  answer: () => {
    const who = person();
    const rating = weighted([
      ["Excellent", 38],
      ["Good", 34],
      ["Okay", 18],
      ["Poor", 10],
    ] as const);
    const recommend = rating === "Excellent" || (rating === "Good" && chance(0.85)) ? "Yes" : chance(0.2) ? "Yes" : "No";
    return {
      fb_name: who.name,
      fb_email: who.email,
      fb_plan: chance(0.35) ? "Premium" : "Free",
      fb_rating: rating,
      fb_recommend: recommend,
      ...(recommend === "No" ? { fb_reason: pick(FEEDBACK_IMPROVEMENTS) } : {}),
      fb_feature: pick(FEATURE_REQUESTS),
      fb_followup: chance(0.6) ? "true" : "false",
    };
  },
};

const WHY_JOIN = [
  "I've used Forma for my college fest registrations and want to work on it.",
  "I enjoy building accessible UIs, and form builders are full of hard accessibility problems.",
  "Your engineering blog on webhook retries was great — I'd like to work on problems like that.",
  "I'm looking for a product team that ships weekly and owns its frontend end to end.",
  "Data-heavy dashboards are my favourite thing to build.",
] as const;

const application: FormSpec = {
  name: "Frontend Engineer — Application",
  thankYouMessage: "Application received. We reply to everyone within a week.",
  isActive: true,
  responses: 64,
  bounceRate: 1.4,
  abandonRate: 0.75,
  dropOff: [
    ["ja_portfolio", 6],
    ["ja_why", 8],
    ["ja_start", 2],
    ["ja_experience", 2],
  ],
  timing: { days: 60, recentBias: 1.2 },
  seconds: [180, 900],
  schema: [
    { id: "ja_name", type: "text", label: "Full name", required: true },
    { id: "ja_email", type: "email", label: "Email", required: true },
    {
      id: "ja_experience",
      type: "select",
      label: "Years of experience",
      required: true,
      options: ["0–1 years", "1–3 years", "3–5 years", "5+ years"],
    },
    { id: "ja_portfolio", type: "text", label: "Portfolio or GitHub URL", required: true },
    { id: "ja_resume", type: "file", label: "Résumé (PDF, optional)", required: false },
    { id: "ja_start", type: "date", label: "Earliest start date", required: true },
    { id: "ja_why", type: "textarea", label: "Why do you want to join Northwind?", required: true },
  ],
  answer: () => {
    const who = person();
    const handle = who.email.split("@")[0]!.replace(/[^a-z0-9]/g, "");
    const start = new Date(Date.now() + int(14, 90) * 86_400_000).toISOString().slice(0, 10);
    return {
      ja_name: who.name,
      ja_email: who.email,
      ja_experience: weighted([
        ["0–1 years", 4],
        ["1–3 years", 6],
        ["3–5 years", 3],
        ["5+ years", 1],
      ] as const),
      ja_portfolio: chance(0.7) ? `https://github.com/${handle}` : `https://${handle}.dev`,
      ja_start: start,
      ja_why: pick(WHY_JOIN),
    };
  },
};

const TALKS = [
  "Webhooks that never lose an event",
  "Postgres row-level isolation in practice",
  "Testing with Cucumber without the pain",
  "Shipping Next.js on a budget",
] as const;
const COLLEGES = ["IIT Bombay", "BITS Pilani", "NIT Trichy", "VIT Vellore", "Delhi University", "IIIT Hyderabad"] as const;

const registration: FormSpec = {
  name: "DevConf 2026 — Registration",
  thankYouMessage: "You're registered! Your ticket arrives by email a week before the event.",
  isActive: true,
  responses: 156,
  bounceRate: 0.7,
  abandonRate: 0.18,
  dropOff: [
    ["ev_college", 4],
    ["ev_talk", 3],
    ["ev_diet", 2],
    ["ev_ticket", 2],
  ],
  timing: { days: 35, recentBias: 0.7 },
  seconds: [40, 200],
  schema: [
    { id: "ev_name", type: "text", label: "Full name", required: true },
    { id: "ev_email", type: "email", label: "Email", required: true },
    {
      id: "ev_ticket",
      type: "select",
      label: "Ticket type",
      required: true,
      options: ["Student", "Professional", "Speaker"],
    },
    {
      id: "ev_college",
      type: "text",
      label: "College or university",
      required: true,
      rules: [rule("ev_rule_college", "ev_ticket", "Student", "ev_college")],
    },
    {
      id: "ev_talk",
      type: "text",
      label: "Talk title",
      required: true,
      rules: [rule("ev_rule_talk", "ev_ticket", "Speaker", "ev_talk")],
    },
    {
      id: "ev_diet",
      type: "select",
      label: "Dietary preference",
      required: false,
      options: ["No preference", "Vegetarian", "Vegan", "Jain"],
    },
    { id: "ev_guests", type: "number", label: "Guests you're bringing (0–2)", required: false },
  ],
  answer: () => {
    const who = person();
    const ticket = weighted([
      ["Student", 9],
      ["Professional", 6],
      ["Speaker", 1],
    ] as const);
    return {
      ev_name: who.name,
      ev_email: who.email,
      ev_ticket: ticket,
      ...(ticket === "Student" ? { ev_college: pick(COLLEGES) } : {}),
      ...(ticket === "Speaker" ? { ev_talk: pick(TALKS) } : {}),
      ...(chance(0.8)
        ? { ev_diet: weighted([["No preference", 5], ["Vegetarian", 4], ["Vegan", 1], ["Jain", 1]] as const) }
        : {}),
      ...(chance(0.5) ? { ev_guests: String(weighted([["0", 6], ["1", 3], ["2", 1]] as const)) } : {}),
    };
  },
};

const waitlist: FormSpec = {
  name: "Mobile App Beta — Waitlist (closed)",
  thankYouMessage: "You're on the list.",
  isActive: false,
  responses: 27,
  bounceRate: 0.4,
  abandonRate: 0.1,
  dropOff: [["wl_device", 1]],
  timing: { days: DAYS, recentBias: 1, minDaysAgo: 70 },
  seconds: [15, 60],
  schema: [
    { id: "wl_email", type: "email", label: "Email", required: true },
    { id: "wl_device", type: "select", label: "Your phone", required: true, options: ["Android", "iPhone"] },
  ],
  answer: () => ({
    wl_email: person().email,
    wl_device: chance(0.7) ? "Android" : "iPhone",
  }),
};

// ---- building rows ----------------------------------------------------------------

type Rows = {
  responses: Prisma.ResponseCreateManyInput[];
  sessions: Prisma.FormSessionCreateManyInput[];
};

const visibleFieldIds = (schema: FormField[], answers: Answers) =>
  schema.filter((field) => isFieldVisible(field, answers)).map((field) => field.id);

/** Responses plus the visits behind them: completed, abandoned and bounced. */
const buildFormRows = (orgId: string, formId: string, spec: FormSpec, now: Date): Rows => {
  const rows: Rows = { responses: [], sessions: [] };
  const { days, recentBias, minDaysAgo } = spec.timing;
  const when = () => submissionTime(now, days, recentBias, minDaysAgo);

  for (let i = 0; i < spec.responses; i++) {
    const answers = spec.answer();
    const submittedAt = when();
    const seconds = int(...spec.seconds);
    const startedAt = new Date(submittedAt.getTime() - seconds * 1000);
    const viewedAt = new Date(startedAt.getTime() - int(3, 40) * 1000);
    const responseId = randomUUID();
    const touched = visibleFieldIds(spec.schema, answers);

    rows.responses.push({ id: responseId, orgId, formId, payload: answers, submittedAt });
    rows.sessions.push({
      orgId,
      formId,
      viewedAt,
      startedAt,
      lastActiveAt: submittedAt,
      fieldsTouched: touched,
      lastFieldId: touched[touched.length - 1] ?? null,
      submittedAt,
      responseId,
    });
  }

  // Started, then left at one of the drop-off fields.
  for (let i = 0; i < Math.round(spec.responses * spec.abandonRate); i++) {
    const answers = spec.answer();
    const stopAt = weighted(spec.dropOff);
    const visible = visibleFieldIds(spec.schema, answers);
    // A conditional stop field that this respondent never saw: stop just before it.
    const stopIndex = Math.max(0, visible.includes(stopAt) ? visible.indexOf(stopAt) : visible.length - 2);
    const touched = visible.slice(0, stopIndex + 1);
    const viewedAt = when();
    const startedAt = new Date(viewedAt.getTime() + int(3, 30) * 1000);

    rows.sessions.push({
      orgId,
      formId,
      viewedAt,
      startedAt,
      lastActiveAt: new Date(startedAt.getTime() + int(10, 240) * 1000),
      fieldsTouched: touched,
      lastFieldId: touched[touched.length - 1] ?? null,
    });
  }

  // Opened the form and never touched it.
  for (let i = 0; i < Math.round(spec.responses * spec.bounceRate); i++) {
    const viewedAt = when();
    rows.sessions.push({ orgId, formId, viewedAt, lastActiveAt: viewedAt });
  }

  return rows;
};

const ago = (now: Date, days: number, hours = 0) =>
  new Date(now.getTime() - (days * 24 + hours) * 3_600_000);

// ---- main -------------------------------------------------------------------------

const main = async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Set DATABASE_URL to the database to seed.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  const now = new Date();

  try {
    const removed = await prisma.organization.deleteMany({ where: { slug: ORG_SLUG } });
    if (removed.count > 0) console.log(`Removed the previous "${ORG_NAME}" demo.`);

    const org = await prisma.organization.create({
      data: {
        name: ORG_NAME,
        slug: ORG_SLUG,
        tier: "PREMIUM",
        subscriptionStatus: "active",
        currentPeriodEnd: new Date(now.getTime() + 24 * 86_400_000),
        createdAt: ago(now, DAYS + 5),
      },
    });

    // The lowest cost the API accepts: this password is published, so a slow
    // hash protects nothing and only makes the demo sign-in slow on a free CPU.
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const users: Record<string, { id: string; email: string }> = {};
    for (const user of USERS) {
      users[user.key] = await prisma.user.create({
        data: {
          orgId: org.id,
          email: user.email,
          name: user.name,
          role: user.role,
          passwordHash,
          emailVerifiedAt: ago(now, DAYS),
          createdAt: ago(now, user.role === "OWNER" ? DAYS + 5 : DAYS - 3),
        },
        select: { id: true, email: true },
      });
    }
    const owner = users.owner!;
    const admin = users.admin!;

    const forms: Record<string, string> = {};
    let responseCount = 0;
    let visitCount = 0;

    for (const [key, spec, createdBy, createdDaysAgo, updatedDaysAgo] of [
      ["feedback", feedback, owner, DAYS + 2, 6],
      ["application", application, admin, 62, 11],
      ["registration", registration, owner, 36, 2],
      ["waitlist", waitlist, owner, DAYS + 1, 68],
    ] as const) {
      const form = await prisma.form.create({
        data: {
          orgId: org.id,
          createdById: createdBy.id,
          name: spec.name,
          schema: spec.schema as unknown as Prisma.InputJsonValue,
          thankYouMessage: spec.thankYouMessage,
          isActive: spec.isActive,
          createdAt: ago(now, createdDaysAgo),
          updatedAt: ago(now, updatedDaysAgo),
        },
      });
      forms[key] = form.id;

      const rows = buildFormRows(org.id, form.id, spec, now);
      await prisma.response.createMany({ data: rows.responses });
      await prisma.formSession.createMany({ data: rows.sessions });
      responseCount += rows.responses.length;
      visitCount += rows.sessions.length;
    }

    // Webhooks on the registration form: a paused Slack one, and a custom
    // endpoint whose last few deliveries failed and can be retried from the UI.
    const slackUrl = "https://hooks.slack.com/services/T0DEMO000/B0DEMO000/northwindDemoHook";
    const crmUrl = "https://crm.northwind.example/hooks/forma";
    const slack = await prisma.webhook.create({
      data: { orgId: org.id, formId: forms.registration!, url: slackUrl, isActive: false, createdAt: ago(now, 30) },
    });
    const crm = await prisma.webhook.create({
      data: { orgId: org.id, formId: forms.registration!, url: crmUrl, createdAt: ago(now, 28) },
    });
    await prisma.webhook.create({
      data: {
        orgId: org.id,
        formId: forms.feedback!,
        url: "https://hooks.zapier.com/hooks/catch/000000/northwind/",
        createdAt: ago(now, 50),
      },
    });

    const recent = await prisma.response.findMany({
      where: { formId: forms.registration! },
      orderBy: { submittedAt: "desc" },
      take: 3,
    });
    const errors = [
      "HTTP 503 Service Unavailable",
      "Request timed out after 8000 ms",
      "HTTP 500 Internal Server Error",
    ];
    await prisma.webhookDeadLetter.createMany({
      data: recent.map((response, i) => ({
        orgId: org.id,
        formId: forms.registration!,
        webhookId: crm.id,
        url: crmUrl,
        payload: {
          formId: forms.registration!,
          responseId: response.id,
          submittedAt: response.submittedAt.toISOString(),
          data: response.payload as Prisma.InputJsonValue,
        },
        lastError: errors[i % errors.length]!,
        attemptsMade: 3,
        failedAt: new Date(response.submittedAt.getTime() + 40_000),
      })),
    });

    // A teammate who hasn't accepted yet. The token is random and thrown away:
    // the invite shows (and can be withdrawn) but its link is never handed out.
    await prisma.invite.create({
      data: {
        orgId: org.id,
        email: "new.hire@northwind.example",
        role: "MEMBER",
        tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        invitedById: owner.id,
        expiresAt: new Date(now.getTime() + 6 * 86_400_000),
        createdAt: ago(now, 1),
      },
    });

    await prisma.auditLog.createMany({
      data: [
        {
          action: "billing.subscription_started",
          actor: owner,
          targetId: org.id,
          metadata: { plan: "yearly" },
          at: ago(now, 64),
        },
        {
          action: "member.role_changed",
          actor: owner,
          targetId: admin.id,
          metadata: { targetEmail: admin.email, from: "MEMBER", to: "ADMIN" },
          at: ago(now, 60),
        },
        {
          action: "webhook.created",
          actor: owner,
          targetId: slack.id,
          metadata: { formId: forms.registration!, url: slackUrl },
          at: ago(now, 30),
        },
        {
          action: "webhook.created",
          actor: admin,
          targetId: crm.id,
          metadata: { formId: forms.registration!, url: crmUrl },
          at: ago(now, 28),
        },
        {
          action: "webhook.updated",
          actor: admin,
          targetId: slack.id,
          metadata: { formId: forms.registration!, isActive: false },
          at: ago(now, 3, 5),
        },
      ].map(({ action, actor, targetId, metadata, at }) => ({
        orgId: org.id,
        actorId: actor.id,
        actorEmail: actor.email,
        action,
        targetId,
        metadata,
        createdAt: at,
      })),
    });

    console.log(
      [
        "",
        `Seeded "${ORG_NAME}" (Premium): 4 forms, ${responseCount} responses, ${visitCount} visits,`,
        "3 webhooks with 3 failed deliveries, 1 pending invite, 5 activity entries.",
        "",
        "Sign in with any of these (same password):",
        ...USERS.map((user) => `  ${user.role.padEnd(6)}  ${user.email}`),
        `  password: ${PASSWORD}`,
        "",
      ].join("\n")
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
