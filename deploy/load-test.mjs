#!/usr/bin/env node
// Load test for the respondent path: open a form, reach its fields, submit.
//
//   node deploy/load-test.mjs [options]
//
//   --base <url>          API origin (default http://localhost:8080)
//   --respondents <n>     how many form fills (default 300)
//   --concurrency <n>     fills in flight at once (default 25)
//   --webhook-url <url>   also attach a webhook to the form and report
//                         failed deliveries at the end. Must be a public
//                         http(s) URL: the app refuses private and local
//                         addresses by design (SSRF protection).
//   --settle <seconds>    how long to wait for deliveries before checking
//                         (default 20, only with --webhook-url)
//
// Each fill is four requests, as the real form page makes them: start a
// visit, report two fields reached, submit with the visit's id. It signs up
// a throwaway organization and leaves its data behind, so point it at a test
// stack, not production. Rate limits are per address and will throttle a
// single machine: run the stack with RATE_LIMIT_SCALE raised (the E2E
// override sets 100), or the 429s are reported as such.
// Needs only Node 18+.

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]]);
    return pairs;
  }, [])
);

const BASE = (args.base ?? "http://localhost:8080").replace(/\/$/, "");
const RESPONDENTS = Number(args.respondents ?? 300);
const CONCURRENCY = Number(args.concurrency ?? 25);
const WEBHOOK_URL = args["webhook-url"];
const SETTLE_SECONDS = Number(args.settle ?? 20);

const timings = new Map(); // step -> [ms]
const statuses = new Map(); // "step status" -> count

const call = async (step, method, path, { token, body, headers } = {}) => {
  const started = performance.now();
  const response = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const elapsed = performance.now() - started;
  const text = await response.text();
  if (step) {
    (timings.get(step) ?? timings.set(step, []).get(step)).push(elapsed);
    const key = `${step} ${response.status}`;
    statuses.set(key, (statuses.get(key) ?? 0) + 1);
  }
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON: fine for a 204.
  }
  return { status: response.status, body: json };
};

const must = (reply, expected, what) => {
  if (reply.status !== expected) {
    console.error(`${what} failed: ${reply.status} ${JSON.stringify(reply.body)}`);
    process.exit(1);
  }
  return reply.body;
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

// ---- Setup: an organization, a form, optionally a webhook ------------------

const suffix = Date.now().toString(36);
const signup = must(
  await call(null, "POST", "/api/auth/signup", {
    body: { email: `load-${suffix}@load.test`, password: "load-test-pass-1", organizationName: `Load test ${suffix}` },
  }),
  201,
  "sign-up"
);
const token = signup.token;

const form = must(
  await call(null, "POST", "/api/forms", {
    token,
    body: {
      title: "Load test",
      schema: [
        { id: "name", type: "text", label: "Name", required: true },
        { id: "email", type: "email", label: "Email", required: false },
        { id: "rating", type: "select", label: "Rating", required: true, options: ["Good", "Bad"] },
      ],
    },
  }),
  201,
  "create form"
);

if (WEBHOOK_URL) {
  must(await call(null, "POST", "/api/webhooks", { token, body: { formId: form.id, url: WEBHOOK_URL } }), 201, "create webhook");
}

// ---- Load ---------------------------------------------------------------------

const fill = async (i) => {
  const visit = await call("start visit", "POST", `/api/forms/${form.id}/sessions`);
  const sessionId = visit.body?.sessionId;
  if (sessionId) {
    await call("field reached", "POST", `/api/forms/${form.id}/sessions/${sessionId}/fields`, { body: { fieldId: "name" } });
    await call("field reached", "POST", `/api/forms/${form.id}/sessions/${sessionId}/fields`, { body: { fieldId: "rating" } });
  }
  await call("submit", "POST", `/api/responses/${form.id}`, {
    body: { name: `Respondent ${i}`, email: `r${i}@load.test`, rating: i % 2 ? "Good" : "Bad" },
    headers: sessionId ? { "x-form-session": sessionId } : {},
  });
};

console.log(`${RESPONDENTS} fills, ${CONCURRENCY} at a time, against ${BASE}`);
const started = performance.now();
let next = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < RESPONDENTS) await fill(next++);
  })
);
const seconds = (performance.now() - started) / 1000;

// ---- Report ---------------------------------------------------------------------

const requests = [...timings.values()].reduce((sum, list) => sum + list.length, 0);
console.log(`\n${requests} requests in ${seconds.toFixed(1)}s: ${(requests / seconds).toFixed(0)} req/s, ${(RESPONDENTS / seconds).toFixed(1)} fills/s\n`);
console.log("step             count     p50     p95     p99     max  (ms)");
for (const [step, list] of timings) {
  const sorted = [...list].sort((a, b) => a - b);
  const cells = [50, 95, 99].map((p) => percentile(sorted, p).toFixed(0).padStart(7));
  console.log(`${step.padEnd(15)} ${String(list.length).padStart(6)} ${cells.join(" ")} ${sorted.at(-1).toFixed(0).padStart(7)}`);
}
console.log("\nstatus codes:");
for (const [key, count] of [...statuses].sort()) console.log(`  ${key.padEnd(22)} ${count}`);
if ([...statuses.keys()].some((key) => key.endsWith(" 429"))) {
  console.log("\n429s: rate limits throttled this machine. Raise RATE_LIMIT_SCALE on the stack under test.");
}

const summary = must(await call(null, "GET", "/api/forms/summary", { token }), 200, "summary");
console.log(`\nresponses stored: ${summary.responses} of ${RESPONDENTS}`);

if (WEBHOOK_URL) {
  console.log(`waiting ${SETTLE_SECONDS}s for webhook deliveries…`);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_SECONDS * 1000));
  const failed = must(await call(null, "GET", `/api/webhooks/${form.id}/dead-letters?limit=100`, { token }), 200, "dead letters");
  console.log(`failed deliveries so far: ${failed.items.length}${failed.nextCursor ? "+" : ""}`);
}
