# Quiet Insights — local delivery design

Implements the approved Quiet Insights product direction and September 10 GitHub-only delivery amendment. User preferences carried forward: independent implementation, English-first bilingual UI, simple product copy, working local persistence, acceptance before publishing. No cloud accounts, domains or paid hosting.

## Scope and approach

Build a local Next.js/TypeScript/React application backed by a dedicated PostgreSQL database. Unlike a browser-only dashboard, the ingestion API accepts real HTTP events and the UI queries saved server data. A cloud deployment is deferred by user instruction. An isolated browser demo workspace provides owner-like controls without claiming real account authentication. Each browser receives an opaque HttpOnly token stored only as a hash in the database.

Applications have separate production/development keys. Show a new key once; retain only SHA-256 hashes. Versioned ingestion validates the entire batch, limits body size, rejects identifying fields and obvious email/IP values, and records idempotency per application/environment/batch ID. Retry with a changed payload is a conflict. Keys can be rotated; old keys fail immediately. Never log request bodies or IP addresses.

Overview: events, distinct anonymous devices, distinct application/device/session combinations, UTC daily trends, event counts, OS/country/version breakdowns. Scope is application, environment and 7/14/30/90-day range with optional version and exact property filters. All counts come from persisted events. Raw queries are capped at 50,000 matching events with an explicit partial-data warning. This first local release uses bounded raw queries; materialized aggregates are a later scale improvement.

Events: ranked event table plus a bounded recent event list. Funnels: save 2–5 ordered event names and a 1–168 hour completion window; each anonymous device can qualify once, all steps must occur in the same session, strictly after the prior step, within the window from the first step. Missing steps are drop-offs; rates are relative to step one. CSV exports use the same filters and neutralize spreadsheet formula cells.

Connect: create applications, select environment, generate demo events through the real ingestion path, rotate keys and copy HTTP/JavaScript examples. No secret is placed into a URL or persisted in browser storage. Settings: 7/30/90-day retention; saving retention purges older events after confirmation. Queries and ingestion prune expired rows, with a CLI cleanup command for idle applications.

## Boundaries

No real member accounts, emails, cross-device identity, raw IP persistence, session recording, hosted deployment or enterprise roles. Anonymous IDs are pseudonymous technical identifiers, not proof that data is anonymous. Fixed allowed property keys (screen, plan, source, feature, result) and bounded categorical values reduce personal-data collection; operators must still avoid sensitive values. Demo runs bind to loopback.

## Acceptance

Create application → get key → send events over HTTP → see persisted counts after refresh/server restart → filter property/version → create ordered funnel → export CSV → rotate key and confirm old key rejected. Verify cross-workspace isolation, malformed input, duplicate/reordered events, empty data, retention and language. Run typecheck, domain tests, isolated DB/API tests, production build and actual browser journey. Show user running product before GitHub publication.
