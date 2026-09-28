# Quiet Insights

A local product analytics workspace with English and Chinese interfaces. Collect
events, inspect usage trends, build ordered funnels, and export aggregate counts.

## Run locally

Requires Node.js 24, pnpm, and PostgreSQL 17. No cloud account is required.

```sh
pnpm install --frozen-lockfile
export QUIET_POSTGRES_BIN=/absolute/path/to/postgresql/17/bin
npm run db:local -- init
npm run db:migrate
npm run dev
```

Open http://127.0.0.1:4182. The database setup creates this project's development
and test clusters on ports 54351 and 54352 and writes a private `.env.local`.
It refuses to overwrite an existing configuration. On subsequent runs use
`npm run db:local -- start`; `stop` stops only these marked project clusters.
Alternatively, supply `DATABASE_URL` and `TEST_DATABASE_URL` for two dedicated
PostgreSQL databases. Never point the test URL at production data.

## Try it

1. Open **Overview** to inspect the seeded Fieldnotes application.
2. In **Connect**, create an application and save its one-time ingestion key.
3. Add sample events or send the provided HTTP example from your terminal.
4. In **Overview**, choose the environment, period, version or property and Apply.
5. In **Funnels**, choose ordered events and a completion window, then save.
6. Export CSV, inspect recent events, or rotate a key in Connect.

Each application has independent production and development events and keys.
Rotating a key immediately invalidates the old one for that environment. A batch
ID is reusable only for retrying the same payload. The UI's JavaScript example
is for a server client; cross-origin browser ingestion is not enabled.

The interface defaults to English and remembers the language in this browser.
Switching language translates the interface, not your event or application names.

## Metrics

- Events count accepted actions; devices count distinct pseudonymous IDs.
- Sessions count distinct device/session pairs, not people or accounts.
- Periods use UTC calendar days including today.
- Funnels count each device once using its best ordered path in one session.
  Equal timestamps do not satisfy sequential steps. Completion windows start at
  the first event. Filters apply to every event considered by the funnel.
- CSV contains aggregate event counts using the same filters.
- Queries cap at 50,000 events and disclose partial results. Raw PostgreSQL
  queries are used in this local release; it is not a large-scale analytics service.

## Data and privacy boundaries

Data persists in PostgreSQL across browser refreshes and server restarts. A
random HttpOnly browser cookie selects an isolated demo workspace. There are no
real accounts, team invitations, password recovery, or production role controls.
Losing the cookie loses the normal UI access to that workspace. Run on loopback;
do not expose this demonstration server to the public internet.

Ingestion keys are stored as hashes. Do not send names, email addresses, raw IP
addresses or private text. The API only permits bounded categorical properties
(`screen`, `plan`, `source`, `feature`, `result`) and rejects obvious email/IP
patterns. This does not guarantee anonymity: application owners remain
responsible for what they send. Device IDs should be random pseudonyms. No
session recordings, geolocation lookup, advertising IDs or user profiles exist.

Retention can be 7, 30 or 90 days. Shortening it deletes older events. Run
`npm run db:cleanup` for cleanup when applications are idle. No scheduled cleanup
service or hosted deployment is provisioned by this project.

## Verify

```sh
npm test
npm run typecheck
npm run test:db
npm run build
npm start
# In another terminal, while the application is running:
npm run test:api
```

Stop the development server before building. API acceptance tests require a running local server; see the
acceptance record for the exact command and current coverage.

## Structure

`src/app` contains the workspace and HTTP routes. `src/lib` separates validation,
analytics and transactional persistence. `scripts` contains local database
management, migration and retention cleanup. `tests` checks calculations and
isolated database/API behavior.

Independent implementation of the product analytics use case. MIT-licensed
original code; Next.js, React, Zod and postgres retain their respective licenses.
No source, branding, assets or Git history from another analytics product is included.
