# Quiet Insights implementation plan

For execution in the current session using the approved suite design and GitHub-only scope.

**Goal:** A runnable bilingual analytics product whose graphs, funnels and exports use persisted ingested events.

**Architecture:** Next App Router UI and same-origin owner API; versioned ingestion route; typed domain validation/analytics; PostgreSQL repository with transactions and per-workspace ownership. Local PostgreSQL lifecycle is isolated from existing products.

**Stack:** Next.js, React, TypeScript, Zod, postgres, Node 24, PostgreSQL 17.

- [x] Create domain contracts and tests: batch validation rejects PII/oversized values; ordered same-session funnels; CSV formula safety; filters and UTC daily buckets. Run `node --test tests/domain.test.ts` red then green.
- [x] Add dedicated database schema and repository. Tables: workspaces, applications, keys, batches, events, funnels. Index events by application/environment/time and scoped batch uniqueness. API transactions authenticate key and insert batch/events atomically. Test duplicate retry, altered retry, key rotation and workspace isolation against separate test database.
- [x] Add routes: GET state/analytics/CSV, POST applications/sample/key/funnel/retention; POST `/api/v1/events`. Owner routes use the demo cookie plus same-origin POST checks. Validate errors and bounded payloads, return actionable messages.
- [x] Build horizontal navigation and Overview, Events, Funnels, Connect, Settings views. Controls use React state, with bilingual labels and UTC date scope. Render graphs from API values and disclose seed source, partial results and privacy boundary.
- [x] Browser acceptance: create app, send samples, filter, funnel, export and rotate. Check narrow layouts, empty/invalid cases, copied examples and refresh persistence.
- [x] Complete English README, MIT license, local setup, CI and acceptance record; run typecheck, tests, integration and build. Present running version for user acceptance; do not publish until accepted.
