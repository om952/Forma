# Forma browser tests

End-to-end tests that drive the real app in Chrome: **Selenium WebDriver**,
with scenarios written in **Cucumber** (Gherkin), organised with the **Page
Object Model**. 35 scenarios across eight features:

| Feature | Covers |
| --- | --- |
| `authentication` | Sign-up, sign-in, wrong password, taken org name, sign-out, signed-out redirect |
| `form_builder` | Building and saving a form, conditional rules, the Free-plan limit, disabling and deleting forms |
| `responding` | Submitting and the thank-you message, required questions, the responses list, CSV export, file upload |
| `webhooks` | Adding a webhook, refusing internal addresses, retrying failed deliveries |
| `team` | Inviting and joining, what admins and members can and can't do, the last owner, removing a member |
| `account` | Password reset, email confirmation, changing the password, signing out everywhere |
| `analytics` | The Premium gate, the funnel and drop-off, the heatmap |
| `billing` | The plan shown to owners, members and Premium orgs |

## Running

The tests need a running stack. The simplest is the production stack with the
test override, which publishes Postgres on `127.0.0.1:55432` and raises the rate
limits (every scenario comes from one machine):

```bash
# From the repository root
docker compose --env-file .env.production \
  -f docker-compose.prod.yaml -f docker-compose.e2e.yaml up -d --build --wait

cd e2e
E2E_DB_PASSWORD=<POSTGRES_PASSWORD from .env.production> ./mvnw test
```

Useful variations:

```bash
./mvnw test -Dcucumber.filter.tags=@smoke           # the six core journeys
./mvnw test -Dcucumber.filter.tags="@team or @billing"
E2E_HEADLESS=false ./mvnw test                       # watch it in a real window
```

The report is written to `target/cucumber-report.html`. A failed scenario
attaches a screenshot, its URL and the page's text to the report, and saves the
screenshot to `target/failures/`. CI keeps both as the `browser-test-report`
artifact.

Nothing needs installing beyond a JDK 21 and Chrome: `./mvnw` downloads Maven,
and Selenium Manager downloads the chromedriver that matches your Chrome.

## Settings

Each can be a `-D` flag or an environment variable of the same name.

| Setting | Default | |
| --- | --- | --- |
| `E2E_BASE_URL` | `http://localhost:8080` | The web app |
| `E2E_API_URL` | the web app's origin | The API, if it is on another origin |
| `E2E_DB_URL` | `jdbc:postgresql://localhost:55432/forma` | The stack's Postgres |
| `E2E_DB_USER` | `forma` | |
| `E2E_DB_PASSWORD` | (required) | The stack's `POSTGRES_PASSWORD` |
| `E2E_HEADLESS` | `true` | |
| `E2E_TIMEOUT_SECONDS` | `15` | How long to wait for the page |

Email must be switched off on the stack under test (no `RESEND_API_KEY`), so
invitations hand their link back to the inviter.

## How it is organised

```
src/test/resources/features/   Scenarios, in business language
src/test/java/com/forma/e2e/
  pages/     One page object per screen: what a person can see and do there
  steps/     Step definitions: translate each Gherkin line into page actions
  support/   World (per-scenario state), Hooks, Api and Database setup, Config
```

- **Page objects** hide selectors. They find things by the text a person reads
  (labels, headings, button names), falling back to `data-testid` attributes
  only where there is no text. They wait for React to hydrate before
  interacting, and read lists in one step so a re-render can't leave a stale
  element behind.
- **Setup** that isn't the point of a scenario goes through the API, for
  example creating the owner and the form before a scenario about responding.
  Each scenario creates its own organization, so scenarios never share data.
- **The database** is used only where a test stack has no other path:
  - upgrading to Premium, since there is no payment provider
  - seeding failed webhook deliveries, since there is no endpoint guaranteed to fail
  - creating the one-time link tokens that would have been emailed, the same
    way the app creates them

  Everything a user does, they do in the browser.
- **`World`** is created fresh for each scenario by Cucumber's PicoContainer and
  shared by that scenario's step classes. It holds the browser, the people in
  the story and the records they made.
