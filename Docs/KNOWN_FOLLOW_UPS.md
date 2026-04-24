# InnerVerse — Known follow-ups

Dashboard of currently-actionable audit findings, deferred decisions,
and accepted tech debt. Status transitions (OPEN → IN PROGRESS →
FIXED → WON'T FIX) are recorded in-place by editing the `Status:`
line, not by removing the entry.

Never delete the audit trail — archive it. When a fresh-session
audit is fully closed out (no OPEN items left or only defer-able LOWs
remain), move its full body to `Docs/review-cadence/audits/<date>.md`
and replace the section in this file with a short stub that links to
the archive and lists only the still-open items in full format. The
first example of this pattern is the 2026-04-23 audit.

## How this file is used

- **Fresh-session audits** (see `review-cadence/audit-prompt-template.md`)
  append a dated section with numbered findings from the four review
  agents. Live audits stay in-place; closed audits archive per the
  rule above.
- **Operator-initiated items** (decisions to defer, limitations we
  know about, items surfaced outside a formal audit) can be added as
  their own dated section.
- **Resolved items** stay somewhere with `Status: FIXED (<date>,
  <commit-SHA>)` so the trail is auditable — either in this file
  while the section is active, or in the archive once moved. Don't
  purge.

## Finding format

```
FINDING <N>
Severity: CRITICAL | HIGH | MED | LOW
Lens: security | data-integrity | correctness | architecture | operator
Location: <file>:<line-or-range>
Root cause: <one sentence>
Blast radius: <who, when, worst case>
Suggested fix: <concrete action>
Status: OPEN | IN PROGRESS | FIXED (<date>, <commit>) | WON'T FIX (<reason>)
```

## Open items known at setup time

None yet. First audit will populate this section.

---

<!-- Audits append below this line. Keep newest at bottom. -->

## 2026-04-21 — Bootstrap exception

Note: Bootstrap exception
Severity: LOW (not a finding, process decision)
Lens: operator
Location: Docs/review-cadence/audit-prompt-template.md, .claude/hooks/check-audit-pending.sh
Root cause: PR #4 (commit b1957f8) installed the review cadence system. Auditing the installer with the system it installs is circular.
Blast radius: None. The bootstrap PR contained only CLAUDE.md, audit-prompt-template.md, KNOWN_FOLLOW_UPS.md, a 22-line SessionStart hook, and a settings JSON. The hook was manually tested in three states (first-run seed, stale, current) before commit.
Suggested fix: Treat PR #4 as pre-audited. Begin cadence from PR #5.
Status: FIXED (2026-04-21, b1957f8)

## 2026-04-21 — /simplify review of PR #10

FINDING 1
Severity: LOW
Lens: architecture
Location: src/lib/brand.ts, src/app/layout.tsx:24
Root cause: The MOB palette (reference/logos/app-colors.png) defines `text: #0F172A` as an on-light token ("Color of static text and icons"), but does not define an on-dark equivalent. The dark-themed shell therefore falls back to Tailwind's `text-neutral-200` on `<body>`, bypassing the brand palette for the site's default text color.
Blast radius: Low today — only one usage. If left, future text surfaces will either replicate `text-neutral-200` or pick ad-hoc Tailwind shades, making it harder to swap to the canonical on-dark color once design finalizes. Not a correctness or security issue.
Suggested fix: When final design assets land (at latest before Phase 10 pre-launch gate), add an `onDark` (or equivalent) token to `BRAND` in src/lib/brand.ts, map it in tailwind.config.ts as `brand.on-dark`, and replace `text-neutral-200` with `text-brand-on-dark` everywhere.
Status: OPEN

## 2026-04-21 — Phase 4 pre-decisions (Supabase Free tier gaps)

FINDING 1
Severity: MED
Lens: data-integrity
Location: Supabase project settings (Free tier)
Root cause: Supabase Free tier provides no automatic backups and no PITR. All InnerVerse data will initially live on a tier with no disaster-recovery baseline.
Blast radius: Zero users today → zero data loss risk for Phase 4 schema work. Once real testers arrive, any corruption or accidental DROP is unrecoverable.
Suggested fix: Upgrade `innerverse-prod` project to Pro ($25/mo, 7-day PITR) at the "Opening to >10 real testers" milestone gate (already a fresh-session-audit gate per `Docs/review-cadence/quality-systems-checklist.md`). Until then, migration hygiene stands in: every migration checked into git as SQL with a companion rollback, plus `pg_dump` before any destructive change.
Status: OPEN

FINDING 2
Severity: LOW
Lens: operator
Location: Supabase project settings (Free tier 500 MB DB cap)
Root cause: Supabase Free tier caps the database at 500 MB. InnerVerse is message-heavy (coaching transcripts), so the cap fills faster than it looks.
Blast radius: None today (empty DB). Once testers are active, a handful of users at typical session length can produce tens of MB per week.
Suggested fix: Monitor DB size weekly once testers are active. Upgrade `innerverse-prod` to Pro when DB crosses 300 MB, or at the ">10 testers" gate (whichever first) — the Pro upgrade is already planned per Finding 1. Pro raises the cap to 8 GB.
Status: OPEN

## 2026-04-22 — /simplify review of PR #15

FINDING 1
Severity: LOW
Lens: architecture
Location: src/app/api/healthcheck/route.ts:16-22
Root cause: Healthcheck calls `supabaseAdmin()` (already imported from `@/lib/supabase`) only to validate env presence, then re-reads `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.SUPABASE_SERVICE_ROLE_KEY` directly with non-null assertions to perform a manual `fetch()` against `${url}/rest/v1/`. The env reads duplicate `supabaseAdmin()`'s internal lookup.
Blast radius: None operationally — the healthcheck works. Cost is maintenance: any env-name change must be made in two places.
Suggested fix: Either (a) extract a small `getSupabaseAdminEnv()` helper exported from `src/lib/supabase.ts` and consume it in both places, or (b) refactor the healthcheck to do its reachability probe through the supabase-js client (e.g., `await client.auth.admin.listUsers({ page: 1, perPage: 1 })`) and drop the manual fetch entirely. Option (b) is cleaner but changes the response shape (loses `status: 200`); decide that intentionally rather than as part of a /simplify polish. Defer to its own PR.
Status: OPEN

## 2026-04-22 — Audit (scope: main..claude/phase-4-identity-tables) (archived)

Full audit archived to [Docs/review-cadence/audits/2026-04-22-phase-4-identity-tables.md](review-cadence/audits/2026-04-22-phase-4-identity-tables.md). 24 findings total: 12 FIXED, 5 PARTIAL FIX, 7 OPEN. See archive for the summary, full finding bodies with FIXED status notes, and the per-lens notes. Only the still-actionable items are tracked below.

FINDING 1
Severity: HIGH
Lens: security
Location: supabase/config.toml:352-356, src/lib/supabase.ts:43-54
Root cause: `[auth.third_party.clerk]` disabled in `config.toml`; `supabaseForUser()` and RLS policies assume the Clerk JWKS integration is live in the hosted Supabase project. Hosted-dashboard setup is invisible from the repo.
Blast radius: If hosted project's Clerk integration is misconfigured, every `supabaseForUser()` query silently returns zero rows (RLS USING evaluates false because `auth.jwt()->>'sub'` is null). Operator can't tell from the repo alone.
Suggested fix: (a) Enable `[auth.third_party.clerk]` in `config.toml` and document the JWKS domain. (b) End-to-end smoke test: sign in, decode the token, INSERT via service-role, confirm same-user SELECT works and cross-user does not.
Status: OPEN

FINDING 4
Severity: HIGH
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql:96-130 (no DELETE policy on users)
Root cause: No `DELETE` policy for `authenticated` on `public.users`. Deletion is expected to go through service-role via the Clerk webhook (4.2b). Until fully verified, no in-app way to self-delete.
Blast radius: GDPR / "right to be forgotten" is unsatisfiable until the deletion webhook is verified end-to-end. The webhook itself landed in PR #18; this finding tracks the verification gap.
Suggested fix: (a) End-to-end verify the deletion webhook (sign up, delete in Clerk dashboard, confirm Supabase row is gone). (b) Document account-deletion-on-request as a manual operation until then. (c) Optional: add `users_delete_own` policy as a self-serve fallback.
Status: OPEN

FINDING 5
Severity: HIGH
Lens: data-integrity
Location: src/lib/supabase.ts:43-54 + supabase/migrations/20260422062124_identity_tables.sql (no users-row creation in scope)
Root cause: A signed-in Clerk user can call `supabaseForUser()` before the `user.created` webhook fires. Any subsequent INSERT into `onboarding_selections` fails with FK violation because `user_id REFERENCES users(id)`.
Blast radius: First-time onboarding breaks if the webhook is delayed/dropped. The `ensureUserRow` self-heal landed in `src/lib/onboarding.ts`, which mitigates but does not eliminate the race. See archive for the full context.
Suggested fix: Verified: webhook + self-heal cover the common path. Remaining work is documented, bounded end-to-end test against a cold-start delivery.
Status: OPEN

FINDING 6
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql:56-65 (onboarding_selections cascade)
Root cause: No mechanism (lint, convention doc) enforces that future user-owned tables consciously decide CASCADE vs RESTRICT vs SET NULL on FKs to `users.id`.
Blast radius: Future tables that forget to specify cascade silently default to `NO ACTION`, leaving orphaned rows after deletion.
Suggested fix: `supabase/README.md` Conventions section now states the rule. Lint/automation enforcement still open.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` Conventions section now states the rule. Lint/automation enforcement still open.

FINDING 7
Severity: HIGH
Lens: security
Location: src/lib/supabase.ts:46-48 (assumes Clerk session token includes 'sub' = Clerk user ID)
Root cause: If Clerk's standard session token does NOT populate `sub` with the Clerk user ID, every RLS check fails silently.
Blast radius: Silent zero-rows for every RLS-scoped query. App appears "broken but not insecure."
Suggested fix: Decode `getToken()` output once in dev and assert `sub` is the Clerk user ID. If not, configure a JWT template explicitly and pass its name.
Status: OPEN

FINDING 18
Severity: MED
Lens: architecture
Location: supabase/migrations/20260422062124_identity_tables.sql + supabase/README.md
Root cause: Migration applied without documented in-repo evidence of a Clerk-scoped smoke test (same-user SELECT vs cross-user SELECT).
Blast radius: Subtle policy bugs surface on first real query. On Free-tier prod with no PITR, hard to recover.
Suggested fix: Smoke-test per the Pre-apply checklist before applying to dev.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` Pre-apply checklist now exists. The actual smoke-test (sign in, decode JWT, verify same-user vs cross-user SELECT) is the operator's task before applying to dev.

FINDING 19
Severity: LOW
Lens: correctness
Location: src/lib/supabase.ts:32 (`Promise<SupabaseClient | null>`)
Root cause: Return type forces null-check at every call site, but TypeScript can't enforce that the check happens.
Blast radius: Easy-to-miss footgun.
Suggested fix: Either add a sibling `supabaseForUserOrThrow()` for sites that require auth, or document the null contract prominently.
Status: OPEN

FINDING 20
Severity: LOW
Lens: correctness
Location: src/app/api/healthcheck/route.ts:16-17 (non-null assertions on env)
Root cause: After `supabaseAdmin()` is invoked just to validate env, `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.SUPABASE_SERVICE_ROLE_KEY!` are read directly. If one env var is missing the other, the assertion lies.
Blast radius: Tiny.
Suggested fix: Per the 2026-04-22 /simplify of PR #15 finding (see earlier section of this ledger): extract `getSupabaseAdminEnv()` or use the supabase-js client for the probe.
Status: OPEN (DUPLICATE of 2026-04-22 /simplify finding)

FINDING 21
Severity: LOW
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql (shared trigger function across two tables)
Root cause: `set_updated_at()` is shared across tables; future change to the function affects all consumers atomically.
Blast radius: Coupling only; not a bug today.
Suggested fix: None today. Convention documented; revisit if behavior needs to diverge per table.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` Conventions section notes the shared trigger function.

FINDING 22
Severity: LOW
Lens: security
Location: src/app/api/healthcheck/route.ts (no rate limiting)
Root cause: Healthcheck is unauthenticated and uncapped.
Blast radius: Low-impact DoS / cost amplification on Vercel.
Suggested fix: Once Vercel Edge Config or an upstream rate-limit is wired, add a tight per-IP cap (e.g., 10 req/sec).
Status: PARTIAL FIX (2026-04-22, PR #17) — README documents the "RLS never disabled on user-owned tables" convention (paired with FORCE RLS in F17). Per-IP rate limiting on the healthcheck endpoint itself remains OPEN.

FINDING 23
Severity: HIGH
Lens: data-integrity
Location: src/lib/supabase.ts:46-54 (token snapshot for long-running operations)
Root cause: Token is fetched once at client-creation time; the Supabase client uses that token for every subsequent query. A long-running server action could exceed the Clerk token TTL and have its tail queries rejected.
Blast radius: Sporadic mid-operation auth failures on long-running paths. Latent today; will matter most for session-end processing in Phase 6+. See also 2026-04-23 audit F14 (now archived), which covers the same concern from a later review.
Suggested fix: For long operations, re-create the client between phases or pass a fresh token at each query. Document expected operation time per consumer.
Status: OPEN

FINDING 24
Severity: LOW
Lens: architecture
Location: supabase/config.toml + supabase/README.md (no documentation of dashboard-side setup)
Root cause: Hosted Supabase project setup (Clerk third-party auth, JWKS domain, role config) lives in the dashboard, not in the repo.
Blast radius: Re-creating prod from scratch requires tribal knowledge; drift between dev and prod can develop unnoticed.
Suggested fix: README section exists; future-state ideal is a CLI verification script.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` now has a 'Hosted-project setup' section. CLI verification script deferred.

## Audit 2026-04-22 — scope: main..claude/phase-4-clerk-webhook

### Summary

13 findings total: 0 critical, 4 high, 6 med, 3 low.

Branch lands Phase 4 chunks 4.1 → 4.2b: Supabase scaffold, identity tables
migration with RLS, the `supabaseForUser()` JWT bridge, and the Clerk
user-lifecycle webhook. The webhook is the dominant new attack surface.
Signature verification, service-role isolation (`'server-only'`), and
RLS layering are all sound. The `set_updated_at()` trigger already has
an `is distinct from` no-op guard, so a hypothesized "every event bumps
`updated_at`" finding turned out to be a false positive and was dropped.

The real risks cluster on **webhook event semantics under Svix retry**:
no idempotency key, no per-user event ordering, payload shape trusted
post-signature, and a `unique(email)` constraint that can lock the
webhook into a permanent retry loop on cross-user email drift. None of
these are exploitable today (zero real users, signing secret unrotated),
but every one becomes harder to fix once user rows exist. Closely
related: operator has no way to distinguish "Clerk secret rotated and
nobody updated Vercel env" from "Supabase blip" — both manifest as
silent webhook failure with Sentry not yet wired.

Recommend resolving F1, F2, F3, F5 before opening to >10 testers
(milestone gate per CLAUDE.md § Review cadence). F4 (operator alerting)
should be addressed when Sentry is wired (currently unwired per
`.env.example`).

### Findings

```
FINDING 1
Severity: HIGH
Lens: data-integrity
Location: src/app/api/clerk-webhook/route.ts:96-122
Root cause: Upsert keyed only on `id` with no event-version or svix-id idempotency check; out-of-order delivery (user.updated arriving before user.created, or after user.deleted) silently overwrites or resurrects rows.
Blast radius: A delayed user.updated arriving after user.deleted recreates a row Clerk has deleted, leaving an orphan in users (and any future user-owned tables) that the user themselves can't see via RLS but that violates GDPR right-to-be-forgotten and inflates row counts. Today's blast: zero (no users); post-launch: per-user data drift indistinguishable from corruption.
Suggested fix: Add a `last_event_id text` and `last_event_ts timestamptz` column to `public.users`; in the webhook, skip the upsert when the incoming `svix-id` was already processed OR when the incoming event timestamp is older than `last_event_ts`. Alternatively, store processed svix-ids in a small dedicated `webhook_events_seen` table with a TTL.
Status: FIXED (2026-04-22, 71952e8) — added `users.last_event_at` column + `public.upsert_user_from_clerk()` race-safe SQL function in migration `20260422150000_users_event_ordering.sql`. Webhook calls the function via `supabase.rpc()`. Stale and duplicate events become no-ops at the database level (verified end-to-end via REST against innerverse-dev: older-timestamp RPC call left row unchanged). Delete-then-resurrect path remains open by design (see Lens-by-lens notes); revisit if it becomes load-bearing.
```

```
FINDING 2
Severity: HIGH
Lens: data-integrity
Location: src/app/api/clerk-webhook/route.ts:99-110 + supabase/migrations/20260422062124_identity_tables.sql:53
Root cause: `users.email` is `unique`. If user A updates their Clerk email to a value already held by user B (account merge, typo correction, deleted-then-recreated), the webhook upsert hits the UNIQUE constraint, returns 500, and Svix retries every few minutes for ~3-5 days. The webhook never recovers without operator intervention; user A's profile stays stale.
Blast radius: User A sees their old email in the app indefinitely. The retry loop spams the DB and the operator's logs but does not data-corrupt. If Clerk rotates a user's email mid-session, the app's view of that user is stuck in the past.
Suggested fix: Catch Postgres error `23505` (unique_violation) on the email column specifically and either (a) write the row without the email field and emit a metric, or (b) return 200 to Svix with a `reason: "email_collision"` body and surface to Sentry. Do NOT retry indefinitely for a permanent constraint violation.
Status: FIXED (2026-04-22, 71952e8) — webhook catches `error.code === "23505"` from the upsert RPC and returns 200 with `action: "email_collision"`, breaking the Svix retry loop. Operator-facing log includes user ID + Clerk error message. Trade-off accepted: the non-email fields (display_name, last_event_at) are NOT written on collision, so the row stays slightly stale until the underlying email conflict is resolved manually. Sentry instrumentation deferred to F4.
```

```
FINDING 3
Severity: HIGH
Lens: security
Location: src/app/api/clerk-webhook/route.ts:78-86
Root cause: After `wh.verify()` succeeds the payload is cast `as ClerkEvent` with no runtime shape validation. `extractPrimaryEmail` and `extractDisplayName` defensively handle missing fields, but `evt.data.id` is dereferenced without a null/empty/type check before being written as the primary key.
Blast radius: A malformed-but-validly-signed payload (Clerk SDK regression, schema change, or a future Clerk event type that reuses `data` differently) can write a row with `id = ""` or trigger a 500 retry storm. Signature verification is the only trust boundary; once past it, anything goes.
Suggested fix: After `wh.verify()`, validate the parsed event with a small schema check: `if (!evt?.type || typeof evt?.data?.id !== "string" || evt.data.id.length === 0) return 400 with reason "invalid_payload"`. Optional: use Zod for the full ClerkEvent shape so future Clerk schema drift fails loudly rather than silently.
Status: FIXED (2026-04-22, 71952e8) — added `validateUserEvent()` helper that checks `type` (non-empty string), `timestamp` (finite number, required for F1's ordering check), and `data.id` (non-empty string). Called from each user.* case branch; failure returns 400 `{ reason: "invalid_payload" }` so Svix stops retrying a permanently malformed event. The non-user `default` case still 200-acks unknown events as before — we don't reject events we don't process.
```

```
FINDING 4
Severity: HIGH
Lens: architecture
Location: src/app/api/clerk-webhook/route.ts:54-64, 88-92, 105-117 + .env.example
Root cause: Webhook returns generic 500 / `db_error` / `invalid_signature` responses with no Sentry hook (Sentry is unwired per CLAUDE.md). A rotated-but-not-synced `CLERK_WEBHOOK_SIGNING_SECRET`, a Clerk schema change, and a transient Supabase outage all look identical to the operator: failed webhooks in Vercel logs, no alert.
Blast radius: New users sign up via Clerk, webhook silently fails, no `users` row exists. First onboarding write hits a foreign key violation. User reports a broken app; operator has no signal until they manually inspect Vercel logs and Clerk dashboard. Misattribution risk is high.
Suggested fix: When Sentry is wired (Phase 6+ per CLAUDE.md), instrument the webhook with one event per failure path (`not_configured`, `invalid_signature`, `db_error`, `unexpected_error`), each with the `svix-id` as a tag. Until then, document the secret-rotation runbook in `supabase/README.md` and consider a tiny `/api/clerk-webhook-health` cron that posts a self-signed test event and pages on 4xx/5xx.
Status: OPEN
```

```
FINDING 5
Severity: MED
Lens: correctness
Location: src/app/api/clerk-webhook/route.ts:54-64
Root cause: Missing `CLERK_WEBHOOK_SIGNING_SECRET` is treated as transient (return 500), so Svix retries for ~3-5 days. If the operator misconfigures Vercel env beyond that window, every user.created event in that window is lost permanently and silently.
Blast radius: Window-bounded silent data loss for new signups during a misconfiguration that isn't caught within the Svix retry budget. Today's risk: zero (pre-launch). Real risk: any future env-var change in Vercel that drops this secret.
Suggested fix: Either (a) keep the 500 but add a deploy-time assertion (e.g., a tiny `npm run check:env` in the Vercel build that fails the deploy if the secret is missing in Production), or (b) treat missing secret as a hard 400 + page the operator immediately.
Status: OPEN
```

```
FINDING 6
Severity: MED
Lens: data-integrity
Location: src/app/api/clerk-webhook/route.ts:35-44
Root cause: `extractPrimaryEmail` correctly null-guards the array but the fallback `emails[0].email_address` reads a property that the type allows but runtime may omit if Clerk's payload shape changes. Returning `undefined` (vs `null`) gets serialized to JSON null in the upsert, clobbering any prior `email` value on user.updated.
Blast radius: A future Clerk payload change (or a partial event during a Clerk degradation) silently nulls existing emails on update. Pairs with F2 (UNIQUE on email) — many concurrent nulls, then any future "set the email back" hits the UNIQUE constraint with the null-having user.
Suggested fix: Return `emails[0].email_address ?? null` and skip the field entirely if null on `user.updated` (build the upsert object conditionally). Avoid blind null-clobber on update.
Status: OPEN
```

```
FINDING 7
Severity: MED
Lens: correctness
Location: supabase/migrations/20260422062124_identity_tables.sql:53
Root cause: `users.email text unique` allows multiple NULL rows (Postgres treats NULLs as distinct in UNIQUE indexes). Comment in migration says "so Clerk-Supabase drift can't produce two rows with the same email" — but two rows with no email at all is permitted.
Blast radius: Low today (Clerk users always have an email). Becomes a real bug if a future code path (admin import, soft-delete tombstone) inserts a null-email row. The constraint as written doesn't enforce what the comment claims.
Suggested fix: Either (a) make `email` NOT NULL (Clerk guarantees one), or (b) add `create unique index users_email_unique_notnull on public.users (email) where email is not null` and document the partial-index intent. Option (a) is simpler and matches Clerk's guarantees.
Status: OPEN
```

```
FINDING 8
Severity: MED
Lens: correctness
Location: src/lib/supabase.ts:55-65
Root cause: `await session.getToken()` is not wrapped in try/catch. If the Clerk SDK throws (network blip, expired key, SDK version mismatch), the rejection propagates to the caller, which by name (`supabaseForUser` returning `Promise<SupabaseClient | null>`) signals "expect null on failure".
Blast radius: Caller sites that don't `try/catch` will surface an unhandled rejection in the route handler and return a 500 instead of degrading gracefully. No call sites exist in scope today, so the bug is latent.
Suggested fix: Wrap `getToken()` in try/catch; log + `return null` on throw. Or: change the JSDoc to document explicitly that callers must catch.
Status: OPEN
```

```
FINDING 9
Severity: MED
Lens: data-integrity
Location: src/app/api/clerk-webhook/route.ts:122-141 (user.deleted case)
Root cause: Webhook calls `delete().eq("id", evt.data.id)` and trusts `ON DELETE CASCADE` on `onboarding_selections.user_id`. No verification that any rows were actually affected (cascade silent if RLS, schema drift, or a future user-owned table without CASCADE blocks it).
Blast radius: Today minimal (only one child table, cascade is correct). When future user-owned tables land (sessions, messages, exports), if any forgets `ON DELETE CASCADE`, the parent delete fails with FK violation, the webhook retries forever, and the user is partly-deleted.
Suggested fix: Make the convention enforceable, not just documented: add a dev-time SQL test that asserts every `user_id`-referencing FK has `ON DELETE CASCADE` (or `SET NULL`, intentionally). Or extend the Phase-4 README pre-apply checklist to include this check.
Status: OPEN
```

```
FINDING 10
Severity: MED
Lens: security
Location: src/app/api/clerk-webhook/route.ts:73 (`req.text()`)
Root cause: Webhook reads `await req.text()` with no body-size limit. A validly-signed but pathologically large payload (or any unsigned huge payload that exhausts memory before the verification check runs) could OOM the serverless function.
Blast radius: Pre-signature DoS risk is mitigated by Vercel's platform-level body limit (4.5MB default for serverless functions on Hobby/Pro), so the practical blast radius is bounded. Still, a small explicit check is cheaper than relying on platform defaults.
Suggested fix: Read `content-length` header before `req.text()`, reject if > N KB (Clerk webhook payloads are well under 100KB). Or accept platform default and document it.
Status: OPEN
```

```
FINDING 11
Severity: LOW
Lens: security
Location: src/middleware.ts:7-13
Root cause: Single negative-lookahead matcher excludes `/api/clerk-webhook` and `/api/healthcheck` from Clerk middleware. Next.js normalizes paths before matchers (collapses `//`, strips trailing slash, decodes `%2F`), so the documented bypass paths are theoretically blocked, but the matcher is fragile to future additions.
Blast radius: If a future API route is added and forgotten in the matcher, it inherits Clerk middleware coverage by default (which is the safe failure mode). Reverse direction (a route that should be public accidentally falling under Clerk) is the bigger concern when this matcher grows.
Suggested fix: Defense-in-depth — pin the matcher to known paths (positive list) instead of growing the negative lookahead, or add a unit test that asserts the expected route → middleware-coverage map.
Status: OPEN
```

```
FINDING 12
Severity: LOW
Lens: correctness
Location: src/app/api/clerk-webhook/route.ts:144-151 (outer catch)
Root cause: Outer `try { switch ... } catch (err)` logs `err` directly via `console.error`. If `err` is a non-Error object or has circular refs, the log may be unhelpful (`[object Object]`). Today this is fine because Supabase errors are returned via `{ error }` not thrown, but any future thrown error here is opaque.
Blast radius: Operator debuggability only.
Suggested fix: Normalize: `console.error("clerk-webhook: unexpected error", err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { raw: String(err) })`.
Status: OPEN
```

```
FINDING 13
Severity: LOW
Lens: architecture
Location: src/app/api/clerk-webhook/route.ts (whole file)
Root cause: No top-of-file comment warns that `auth()` from `@clerk/nextjs/server` will return an empty session here (route is excluded from Clerk middleware). The header comment notes "signature verification is the auth layer" but doesn't explicitly forbid calling `auth()` from this route.
Blast radius: A future contributor adding any "let me get the current user" logic here will silently get a non-authenticated session and could write the wrong row.
Suggested fix: One-line addition to the header comment: "Do NOT call Clerk's `auth()` from this route — there is no Clerk session context, only an svix-signed payload."
Status: OPEN
```

### Lens-by-lens checklist coverage

All four agents responded to all 13 blind-spot items. Items not flagged
were called out as N/A with reasons (PK-based upserts have no TOCTOU
window, the trigger has a no-op `is distinct from` guard, no Promise.all
in scope, no XSS surface in JSON-only handlers, no Edge/Node runtime
mismatch — webhook is `force-dynamic` Node, middleware is Edge, both
correct). One agent flagged `updated_at` chatter (Architecture F1 in
their report) which I dropped because the trigger function explicitly
guards no-op updates.

## 2026-04-22 — Landing-page logo doesn't match legacy screenshot

FINDING 1
Severity: LOW
Lens: operator
Location: src/app/page.tsx, public/innerverse-mark.png
Root cause: No transparent-background bare-symbol InnerVerse logo exists in the repo's asset files. All candidates — `reference/logos/Innerverse_logo color.png` (wordmark + tagline baked in), `reference/logos/innerverse_logo only 300x300.jpg` (opaque black bg), `public/icon-512.png` (opaque dark-teal bg from PWA icon generation) — have backgrounds that show as a visible box around the circles when composited over the cosmic landing background. Chunk 4.3b shipped a generated transparent PNG (`public/innerverse-mark.png`, derived by mapping the JPG's luminance to alpha with a threshold) as a stopgap, but the operator confirmed it still reads wrong visually on the deployed Preview.
Blast radius: Cosmetic only. The `/` landing functions correctly for unauthenticated users (Get started + Sign in routes work, the onboarding redirect for signed-in users works). Affects first impression on the marketing page, not any app behavior.
Suggested fix: Operator supplies a properly-mastered transparent-PNG version of the bare concentric-circles mark (ideally 512×512 or larger, white-on-alpha). Drop it in as `public/innerverse-mark.png`. No code change needed; `src/app/page.tsx` already references that path. Delete the generated stopgap.
Status: OPEN

## 2026-04-22 — Fresh-session audit: Phase 6 Chunk 6.1 migration

### Summary

Scope: `supabase/migrations/20260422170000_coaching_session_tables.sql` —
the session/message/breakthrough/insight/next-step/feedback/coaching-state
schema for the Phase 6 coaching-session feature.

Audit process: four parallel Explore agents (security, data-integrity,
correctness, architecture) with the full 13-item blind-spot checklist.
Aggregator had context from design conversation — flagged here so the
reader knows this audit is not as cold as a separate-session run would be.
Recommend repeating with a true fresh session at the next milestone gate
if any CRITICAL items below turn out to need verification.

Agents produced 52 raw findings. After deduplication and fact-checking:
**5 genuine actionable findings** (1 MED, 3 LOW, 1 carry-forward cluster
for Chunk 6.3); **many "critical" findings invalidated** on review —
several misunderstood Postgres RLS+FK transaction semantics, one missed
the `alter default privileges` block from migration
`20260422151000_grant_service_role_users.sql` that auto-grants
service_role on all new public tables, and several conflated a single
indexed subquery with an N+1 pattern. The rejected items are
documented below so the reasoning is preserved.

Merge recommendation for 6.1: **proceed** after addressing the three
LOW/doc findings below. The MED finding is a defensive-depth ask; take
it or consciously defer. The Chunk 6.3 carry-forward cluster must be
enforced when 6.3 lands — not a 6.1 merge blocker.

### Genuine findings — address in 6.1

FINDING 1
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260422170000_coaching_session_tables.sql:187-200
Root cause: session_feedback has no CHECK preventing a row where all three ratings AND the reflection AND additional_feedback are simultaneously NULL. The UI "Skip for now" path should produce no row (not an empty row), so an all-null row would indicate an application-layer bug, not a valid user action.
Blast radius: Low. Currently prevented by application UX discipline. If 6.3 code accidentally inserts on the "Skip" path, the empty row is hard to distinguish from a real "user submitted but left everything blank" case that shouldn't be possible in the UI.
Suggested fix: Add `CHECK (reflection IS NOT NULL OR supportive_rating IS NOT NULL OR helpful_rating IS NOT NULL OR aligned_rating IS NOT NULL OR additional_feedback IS NOT NULL)` to the session_feedback table. A row must carry at least one user-supplied value.
Status: OPEN

FINDING 2
Severity: LOW
Lens: architecture
Location: supabase/migrations/20260422170000_coaching_session_tables.sql:13-18 (scope note on dropped Bubble fields)
Root cause: The scope note documents that `updated_goals` is dropped for Phase 6, but doesn't enumerate the Bubble fields that were dropped from breakthroughs (`related_goal`, `percentage`, `subtext`, `note`) and insights (`percentage`, `title`). A future maintainer reading the Bubble data-type screenshots will wonder why these fields are missing and may re-add them thinking they were forgotten.
Blast radius: Maintenance cost only. No runtime issue.
Suggested fix: Expand the scope note to explicitly list each dropped Bubble field and cite its reason (Tier 2 feature, requires goals table, etc.). See migration comment block lines 27–35.
Status: OPEN

FINDING 3
Severity: LOW
Lens: architecture
Location: supabase/migrations/20260422170000_coaching_session_tables.sql:217-229 (coaching_state columns)
Root cause: The three style_calibration columns (directness, warmth, challenge) have no inline documentation explaining what each represents, their expected range, or how they map into prompt assembly. A reader must cross-reference the session-end prompt and the style_calibration_delta JSON to understand.
Blast radius: Maintenance cost only.
Suggested fix: Add a short column-level comment for each: what dimension it captures (-1 to +1 semantic scale), how deltas are applied, and where it feeds into prompt assembly. See the column-comment approach suggested by the architecture agent.
Status: OPEN

FINDING 4
Severity: LOW
Lens: security
Location: supabase/migrations/20260422170000_coaching_session_tables.sql:245-269 (RLS preamble)
Root cause: The migration assumes `auth.jwt()->>'sub'` always resolves to the Clerk user ID (the same pattern as identity_tables), but doesn't repeat the documentation of this dependency. If the Clerk JWT template is ever reconfigured to use a different claim, every RLS policy in this migration silently fails closed. The invariant is documented in `src/lib/supabase.ts` and identity_tables migration, so this is redundant documentation, but cheap.
Blast radius: Only materializes if Clerk JWT template is changed. Currently stable.
Suggested fix: One-line comment near the RLS preamble referencing the Clerk JWT template dependency and pointing at the identity_tables migration for details.
Status: OPEN

### Chunk 6.3 carry-forward — enforce when session-end processing lands

FINDING 5 (cluster — multiple agent findings consolidated)
Severity: HIGH (if not delivered in 6.3)
Lens: data-integrity + correctness
Location: deferred — Chunk 6.3 session-end processor
Root cause: 6.1 schema is correct but contract-incomplete without 6.3's atomic-write function. Specific requirements 6.3 must satisfy:
  (a) All session-end writes (sessions UPDATE, breakthroughs/insights/next_steps INSERTs, coaching_state UPSERT) run inside one explicit transaction. Any failure rolls back the whole set.
  (b) sessions UPDATE uses `WHERE id = $1 AND ended_at IS NULL` so duplicate session-end calls become no-ops instead of overwriting prior analysis.
  (c) coaching_state write uses `INSERT ... ON CONFLICT (user_id) DO UPDATE SET ...` so concurrent session-start races don't fail.
  (d) All incoming JSON values are validated/clamped before INSERT: progress_percent clamped to 0..100, arrays validated as arrays, style_calibration_delta clamped to ±0.1, running coaching_state values clamped to ±1.0 (or whatever bound app picks).
  (e) is_substantive is set to a non-null boolean by every session-end call. Nullable only while session is in-progress — never after session-end runs to completion.
  (f) ai_response_id values written to messages come only from OpenAI's response payload, never from client input.
Blast radius: If 6.3 skips any of these, silent data corruption or user-facing failures on retry. The schema cannot enforce these itself — 6.3 code review must.
Suggested fix: 6.3 PR description must explicitly confirm each sub-requirement (a)-(f). Reviewer checklist.
Status: OPEN (carry-forward)

### Rejected / hallucinated findings — documented for posterity

Recording so future readers don't re-raise the same concerns:

- **"Cross-session attack via guessed UUID"** (sec F2, F5): INSERT subquery filters sessions to the caller's own — a guessed foreign UUID can't match.
- **"TOCTOU race between RLS check and FK commit"** (sec F1, data F3, F7): both run in the same transaction; MVCC + row locks prevent the interleaving.
- **"Missing service_role grants on new tables"** (arch F2): handled by `alter default privileges` in `20260422151000_grant_service_role_users.sql:21-25`.
- **"Tier 2 scope creep via sessions index"** (arch F13): the index serves Tier 1 cross-session memory (fetch last session summary at prompt assembly).
- **"N+1 query pattern in RLS subquery"** (arch F6, F12): a single PK-indexed subquery per INSERT is O(log n), not N+1.
- **"UNIQUE(session_id) on session_feedback creates a race"** (sec F3): Postgres UNIQUE is atomic — standard insert/retry semantics.
- **"smallint for progress_percent is a hidden type-narrowing hazard"** (corr F1): 0..100 fits with headroom.
- **"CHECK ((ended_at IS NULL) OR (summary IS NOT NULL)) to prevent orphans"** (corr F11): would reject the expected short-session path where 6.3 sets `is_substantive=false` and skips summary.
- **"Schema-layer enforcement of messages.user_id = sessions.user_id invariant"** (corr F9, arch F14): would require a trigger; strengthened INSERT RLS makes the application responsibility acceptable.

### Lens-by-lens checklist coverage

All four agents ran through the 13 blind-spot items. Coverage summary:
security (14 raw findings, 2 genuine after filter), data-integrity
(8 raw, 1 genuine + 1 carry-forward), correctness (15 raw, 2 genuine
+ 2 carry-forward), architecture (15 raw, 3 genuine + 2 carry-forward).
Nothing new surfaced on items 4, 9, 12, 13 beyond what was already in
the migration design.

## 2026-04-22 — `supabase db dump` requires Docker on Windows

FINDING 1
Severity: LOW
Lens: operator
Location: supabase/README.md (Workflow → "Pre-prod backup" command)
Root cause: `npx supabase db dump --linked -f ...` shells out to a Postgres-version-matched container image. On Windows without Docker Desktop running, the command fails with "the docker client must be run with elevated privileges to connect" before producing any output. The README workflow lists this as the pre-prod backup step but doesn't note the Docker dependency.
Blast radius: Operator-on-Windows-without-Docker cannot run the documented backup. During the Phase 6 Chunk 6.1 prod apply (2026-04-22), the backup step was skipped — justified by zero prod data + purely-additive migration (DOWN block in the migration file is the rollback). Once real user data lands at the >10-tester gate, this becomes blocking: backup is required, and the documented command won't run.
Suggested fix: Either (a) install Docker Desktop on the operator's machine and document it as a prerequisite in `supabase/README.md`, (b) switch the documented backup to a no-Docker alternative (Supabase dashboard → Database → Backups, or `pg_dump` via direct connection string with `psql` installed), or (c) defer the upgrade to Pro tier (which adds PITR + automated backups, removing the need for manual `pg_dump` for routine work). Decide before the >10-tester milestone gate.
Status: OPEN

## 2026-04-23 — Vercel Hobby cron cap blocks sub-daily abandonment sweep

FINDING 1
Severity: MED
Lens: operator
Location: vercel.json, src/app/api/cron/sweep-stale-sessions/route.ts
Root cause: Vercel Hobby tier caps cron job frequency at once-per-day. Phase 6 Chunk 6.3 originally shipped with `*/15 * * * *` (every 15 minutes) in `vercel.json`, which Vercel silently rejected — the branch had no deployment created at all, only a "deployment failed" status check with no buildable log. Downgraded to daily `0 9 * * *` to get the branch deploying. Daily cron means abandoned sessions (user closes tab without clicking End on a substantive session) get analyzed within ~24 hours in steady state, up to ~48h worst case. The operator "Run now" button from the Vercel dashboard still works for on-demand sweeps during testing.
Blast radius: At current tester scale (operator only) this is harmless — manual Run-now covers abandonment testing. Real users abandoning sessions would see stale "in-progress" state on /home for up to a day once 6.4 surfaces that state. Not data loss — just UX lag on the cross-session-memory feed.
Suggested fix: Before opening to >10 testers, choose one: (a) upgrade Vercel project to Pro (~$20/mo) and change schedule back to `*/15 * * * *`; (b) wire an external cron service (cron-job.org, GitHub Actions, EasyCron, etc.) that posts to `/api/cron/sweep-stale-sessions` with the shared secret at 15-minute intervals; (c) accept the daily cadence as v1 behavior if UX testing shows it's tolerable. Option (b) is free and flexible.
Status: OPEN

## 2026-04-23 — Fresh-session audit: 9d6c29b..HEAD (archived)

Full audit archived to [Docs/review-cadence/audits/2026-04-23.md](review-cadence/audits/2026-04-23.md). 14 findings total: 8 FIXED, 6 OPEN, 1 PARTIAL. See archive for the summary, the Chunk-6.1-carry-forward verification, full finding bodies, rejected/hallucinated findings, and lens checklist coverage. Only the still-actionable items are tracked below.

FINDING 5
Severity: MED
Lens: data-integrity
Location: src/app/api/cron/sweep-stale-sessions/route.ts (findStaleSessions — two-phase read)
Root cause: Sweep lists open sessions first, then per-session fetches newest message. A user POST landing between the two reads can make the session look stale when it isn't, and the cron closes it. See archive § FINDING 5 for the full trace.
Blast radius: Negligible at daily cadence (ms-wide window per session). Becomes user-visible if cadence drops to sub-daily — active session dies mid-conversation with a 409 on the next turn.
Suggested fix: Single SQL snapshot via CTE: `ended_at IS NULL AND started_at < cutoff AND NOT EXISTS (SELECT 1 FROM messages WHERE session_id = sessions.id AND created_at > cutoff)`. Or `SELECT ... FOR UPDATE SKIP LOCKED`.
Status: OPEN

FINDING 8
Severity: LOW
Lens: correctness
Location: src/lib/session-end.ts:44-51 (parseAnalysisJson)
Root cause: Markdown-fence strip before `JSON.parse` tolerates `` ```json…``` `` wrappers but breaks on anything else (double fences, prose prefix, HTML). See archive § FINDING 8.
Blast radius: Malformed LLM response throws at parse, fails closed, session sticks analyzed=null. Defer until FINDING 4 retries are exercising the path regularly.
Suggested fix: OpenAI structured output mode (`text: { format: { type: "json_schema", schema: ... } }`) + drop the fence strip. Or Zod-validate the parsed JSON.
Status: FIXED (2026-04-24, via PR — switched `responses.create()` to structured outputs with a strict JSON schema (`session_end_analysis`) mirroring all 13 fields `process_session_end` reads. `parseAnalysisJson` deleted entirely; inlined `JSON.parse(response.output_text)` at the call site. Explicit truncation check (`response.status !== "completed"`) and refusal scan (`output[].content[].type === "refusal"`) added with distinct Sentry stage tags (`session_end_truncated`, `session_end_refusal`) so incomplete responses don't surface as generic parse errors. Strict-mode constraints (no `minimum`/`maximum`/`minItems` allowed) mean range enforcement stays in the prompt and the RPC defensive-parse migration; prompt trimmed to remove lines fully duplicated by the schema (JSON-only rule, snake_case rule, no-code-fences rule) and the stale `updated_goals` example field that was dropped in Phase 6.1 but still appeared in the example block.

FINDING 9
Severity: LOW
Lens: architecture
Location: src/app/api/clerk-webhook/route.ts:194-213
Root cause: Email UNIQUE collision on users.email 200-acks Svix and Sentry-captures at `level: "warning"`, but the Supabase row isn't updated. No alerting. See archive § FINDING 9.
Blast radius: Zero today (operator-only). At >10 testers: stale Supabase email fields silently accumulate; admin queries by email drift from Clerk truth. No data loss.
Suggested fix: (a) Sentry alert rule on `webhook_stage: email_collision` at the next milestone gate (one dashboard click), or (b) `webhook_reconciliation_queue` table for batch reconciliation.
Status: FIXED (2026-04-24, operator action — Sentry Issue Alert "Clerk webhook — email collision" created in the `javascript-nextjs` project. Condition: tag `webhook_stage` equals `email_collision`. Action: email notification to operator. Action interval: 24h). Option (b) — the `webhook_reconciliation_queue` table — remains deferred; reopen if stale-row volume exceeds what manual reconciliation from Sentry alerts can handle.

FINDING 10
Severity: LOW
Lens: security
Location: src/lib/session-end.ts:37-39 + reference/prompt-session-end-v3.md
Root cause: Raw user message content concatenated into the session-end prompt as `Client: <content>` with no delimiter framing. Self-prompt-injection possible. See archive § FINDING 10.
Blast radius: Self-only (RLS scopes transcript to the user's own messages). No cross-user impact. Downstream clamps (±0.1 deltas, ±1.0 running) bound the damage to style-calibration drift.
Suggested fix: Delimiter framing (`<user_message>…</user_message>` tags + prompt instruction to treat as inert data). Defer until real users exist.
Status: OPEN

FINDING 11
Severity: LOW
Lens: architecture
Location: src/middleware.ts:6-18
Root cause: Middleware matcher enumerates unauthenticated routes by name in a negative-lookahead regex. Adding a new public route requires editing the exclusion list; no auto-401 on miss (the earlier "silent 401" claim was wrong). See archive § FINDING 11.
Blast radius: Maintenance only. Forgotten exclusion → Clerk session attach runs on a public route unnecessarily (~10-50ms + Clerk quota).
Suggested fix: Path convention (`/api/public/*`) so the exclusion is one prefix. Apply before adding another public route.
Status: FIXED (2026-04-24, via PR — matcher now excludes `api/public` as a prefix; convention documented in src/middleware.ts comment. Three legacy routes (api/healthcheck, api/clerk-webhook, api/sentry-test) grandfathered in place to avoid breaking Clerk dashboard webhook URL and external uptime monitors; new public routes go under /api/public/* with no matcher edit needed).

FINDING 13
Severity: LOW
Lens: security
Location: src/app/api/sessions/[id]/messages/route.ts (stream accumulator)
Root cause: Accumulated response string has no server-side upper-bound guard. In practice capped by OpenAI's `max_output_tokens`; if that assumption ever breaks the worker could OOM. See archive § FINDING 13.
Blast radius: Near-zero today. Future risk is a model/SDK change that removes the implicit cap, or prompt-injection steering into a non-terminating loop. Mitigated by Vercel serverless memory/wall-clock limits.
Suggested fix: Add `if (accumulated.length > MAX_STREAM_BYTES) { break; }` inside the `for await` loop as defense-in-depth.
Status: PARTIALLY FIXED (2026-04-24, 9dff774 via PR #35 — explicit `max_output_tokens: MAX_OUTPUT_TOKENS` on the streaming call. Accumulator guard still deferred.)

FINDING 14
Severity: LOW
Lens: architecture
Location: src/lib/supabase.ts:44-67 (supabaseForUser)
Root cause: Clerk JWT is captured at client creation and baked in for the request lifetime. At Clerk's default 60s TTL, any server action longer than that risks 401-on-RLS in its tail half. See archive § FINDING 14.
Blast radius: Theoretical today. A longer prompt + slower model could push `runSessionEndAnalysis` past 60s between `loadTranscriptText` and the final `rpc(...)`. The observed error is a misleading RLS rejection.
Suggested fix: Document the expected max duration on `src/lib/supabase.ts:44`. For long-running actions, re-create the client before the tail write, or switch to `supabaseAdmin()` with explicit `user_id` filters.
Status: OPEN
