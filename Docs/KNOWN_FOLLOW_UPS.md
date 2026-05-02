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

## 2026-05-02 — Cross-session continuity feature (designed, on hold)

Note: Conditional follow-up — designed but not yet triggered
Severity: N/A (no current bug; designed feature on hold)
Lens: operator
Location: `Docs/cross-session-continuity-plan.md`
Root cause: Another planning session proposed a heavyweight "synthesized user brief" feature for cross-session coaching coherence. Walking through it surfaced that most of the proposed system already exists in the current `formatClientProfile` injection (last summary, breakthroughs, goals, style, growth narrative). The actual gap — if there is one — is **unresolved threads** the user mentioned but didn't work. Could be a real coaching gap, but might just be a hypothetical concern.
Blast radius: None today. Building speculatively for an unobserved problem risks (a) implementing the wrong thing, (b) introducing pattern-locking / loss-of-beginner's-mind failure modes, (c) wasting cycles on an imagined gap.
Suggested fix: If a beta tester reports any of these — *"the coach feels like it forgets what we worked on,"* *"I have to re-explain context every session,"* *"my sessions don't feel connected,"* or surfaces an unresolved thread the coach failed to acknowledge — ship the lightest version detailed in `Docs/cross-session-continuity-plan.md`. Plan includes schema, synthesis-prompt extension, injection helper, master-prompt update, and structural defenses against pattern-locking. Designed to be implementable from the doc alone.
Status: ON HOLD (pending real-user signal)

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

## 2026-04-24 — Audit (scope: main..feat/home-extras-schema) — PR #53

### Summary

12 findings total: 3 HIGH, 5 MED, 4 LOW. Two HIGH and one MED addressed inline in PR #53 (`next_steps_update_own` policy added, deployment-ordering note added to migration header, premature "Phase 7 Chunk 1" reference dropped). One HIGH and two MED WON'T FIX — the "partial-failure constraint idempotency" scenario surfaced by three lenses is not reachable because the `pg_constraint` lookup re-evaluates on re-run and re-attempts `ADD CONSTRAINT` if absent. Remaining LOW / architectural findings are intentional or informational.

Scope was tight (one migration file, +45 lines). Four parallel Explore agents ran the four lenses per `Docs/review-cadence/audit-prompt-template.md`.

### Findings

FINDING 1
Severity: HIGH
Lens: data-integrity
Location: supabase/migrations/20260422170000_coaching_session_tables.sql:387-404 (next_steps RLS)
Root cause: `next_steps` shipped in Phase 6 with SELECT + INSERT policies only. The `/next-steps` checklist (Chunk 8) toggles `status` client-side, which requires UPDATE. Without an UPDATE policy, RLS silently rejects every toggle and the UI appears to hang.
Blast radius: Chunk 8 feature completely non-functional in production. Silent failure mode — no client-side error surface since RLS rejection returns zero affected rows, not an error.
Suggested fix: Add `next_steps_update_own` policy in this same migration so the policy lands atomically with the `status` column it gates.
Status: FIXED (2026-04-24, 6001178) — policy added to `supabase/migrations/20260424120000_home_extras_columns.sql`.

FINDING 2
Severity: HIGH
Lens: correctness
Location: Cross-file coupling between migration (20260424120000) and RPC (20260423120000)
Root cause: The follow-up RPC update (Chunk 2) writes to `sessions.coach_message` and `breakthroughs.note`. If that RPC lands on prod before this schema migration, `process_session_end` fails with "column does not exist", rolling back the entire session-end transaction and leaving sessions permanently stuck with `summary IS NULL`. Timestamp ordering makes `supabase db push` serialize correctly when both are unapplied on the same env, but split-deploys (e.g., hotfix cherry-pick) break the order.
Blast radius: One session-end call per affected user permanently stuck. Same failure mode that already produced 20260423120000_process_session_end_defensive_parse.sql.
Suggested fix: Explicit deployment-ordering note in migration header + PR body.
Status: FIXED (2026-04-24, 6001178) — header comment in `20260424120000_home_extras_columns.sql` now declares the ordering requirement in a dedicated "Deployment ordering" block, and PR #53 body flags it.

FINDING 3
Severity: HIGH
Lens: security
Location: supabase/migrations/20260424120000_home_extras_columns.sql:60-72 (CHECK constraint idempotency guard)
Root cause: Agent claimed that on partial migration failure (columns added but `ADD CONSTRAINT` fails mid-run), a re-run's `pg_constraint` lookup would return "constraint exists" and skip re-adding it, leaving an unguarded column. Same concern was raised by correctness lens (FINDING 6) and data-integrity lens (FINDING 5).
Blast radius: Described scenario.
Suggested fix: Split into two migrations, or wrap in EXCEPTION handler, or rely on CONSTRAINT ... NOT VALID + VALIDATE.
Status: WON'T FIX (2026-04-24) — the premise is wrong. If `ADD CONSTRAINT` fails, the DO block raises and the transaction rolls back; if the failure is outside a transaction, the constraint simply isn't there, and the next run's `pg_constraint` lookup returns false (the constraint IS absent) and re-attempts the `ADD CONSTRAINT`. The alleged "sees constraint exists, skips" state is not reachable. Logged here for the trail.

FINDING 4
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260424120000_home_extras_columns.sql:60-72
Root cause: Duplicate of FINDING 3.
Status: WON'T FIX (2026-04-24) — see FINDING 3.

FINDING 5
Severity: MED
Lens: correctness
Location: supabase/migrations/20260424120000_home_extras_columns.sql:60-72
Root cause: Duplicate of FINDING 3.
Status: WON'T FIX (2026-04-24) — see FINDING 3.

FINDING 6
Severity: LOW
Lens: correctness
Location: supabase/migrations/20260424120000_home_extras_columns.sql:55 (NOT NULL DEFAULT 'pending' bulk-fills existing rows)
Root cause: `NOT NULL DEFAULT 'pending'` applied to an existing column means all pre-migration rows receive `status = 'pending'` on disk, bypassing any hypothetical trigger logic (e.g., a future `updated_at` trigger would produce a backwards `created_at < updated_at` ordering).
Blast radius: None today — `next_steps` has no `updated_at` trigger. Hypothetical future risk.
Suggested fix: Document intent in the migration comment.
Status: WON'T FIX (2026-04-24) — intent documented in existing header. If `next_steps` gains an `updated_at` trigger later, that migration should set `updated_at = created_at` for retrofitted rows as part of its own forward step.

FINDING 7
Severity: MED
Lens: architecture
Location: supabase/migrations/20260424120000_home_extras_columns.sql:1-2 (premature "Phase 7 Chunk 1" label)
Root cause: Header referenced "Phase 7 Chunk 1" but no Phase 7 scope is documented in `reference/decisions.md`. Introduces a phase numbering scheme without a published definition.
Blast radius: Documentation clarity only.
Suggested fix: Drop the phase reference or predefine Phase 7.
Status: FIXED (2026-04-24, 6001178) — header reworded to drop the premature Phase 7 reference.

FINDING 8
Severity: MED
Lens: architecture
Location: supabase/migrations/20260424120000_home_extras_columns.sql:55, 69-70 (`status` hardcoded enum)
Root cause: `CHECK (status IN ('pending', 'done'))` locks the state machine at two values; adding a third (e.g., 'archived') requires a new migration to `ALTER CHECK`.
Blast radius: Future migration overhead if/when a third state is justified.
Suggested fix: Document that the two-state design is intentional and locked.
Status: WON'T FIX (2026-04-24) — intentional. Matches the `text + CHECK` pattern used elsewhere in the repo. If a third state is ever justified, a separate migration `ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT` is the right shape.

FINDING 9
Severity: MED
Lens: architecture
Location: supabase/migrations/20260424120000_home_extras_columns.sql (implicit layer contract with follow-up RPC)
Root cause: Agent worried that the follow-up RPC must always supply `status='pending'` on INSERT, or the NOT NULL CHECK fires.
Blast radius: Agent's worry case doesn't hold — the column has `DEFAULT 'pending'`, so any INSERT without explicit `status` is valid (Postgres applies the default pre-CHECK).
Status: WON'T FIX (2026-04-24) — premise is wrong; the DEFAULT handles it. Logged here for the trail.

FINDING 10
Severity: LOW
Lens: architecture
Location: supabase/migrations/20260424120000_home_extras_columns.sql (three columns grouped in one file)
Root cause: Three unrelated columns (breakthroughs, sessions, next_steps) live in one migration. Defensible under the "Home-tab extras" theme but worth watching.
Status: WON'T FIX (2026-04-24) — intentional. All three ship atomically for the same user-facing feature; separation by table would fragment a single logical change.

FINDING 11
Severity: LOW
Lens: architecture
Location: supabase/migrations/20260424120000_home_extras_columns.sql (DOWN block as comment)
Root cause: DOWN block is a comment (not auto-executed). Matches the existing repo convention.
Status: FIXED (2026-04-24, 6001178) — no code change needed; pattern matches `20260422062124_identity_tables.sql` etc.

FINDING 12
Severity: LOW
Lens: architecture
Location: supabase/migrations/20260424120000_home_extras_columns.sql:63-64 (`breakthroughs.note` naming)
Root cause: Naming mirrors Bubble's legacy field; unique in current schema.
Status: FIXED (2026-04-24, 6001178) — no code change needed; confirmed no naming collision.

## 2026-04-24 — Audit (scope: main..feat/session-end-coach-message) — PR #55

### Summary

11 findings total: 0 CRITICAL, 1 HIGH, 5 MED, 5 LOW. The HIGH and four MED addressed inline in PR #55 (prompt renamed v3→v4, SCHEMA↔DB coupling comment updated to mention nested structure, defensive `left(..., 2000)` cap on coach_message, expanded DOWN block, service_role trust-boundary cross-reference, explicit ordering note in RPC header). Remaining LOW findings are pre-existing duplicates, render-surface concerns for Chunk 7, or deliberately deferred defense-in-depth that the atomic strict-mode schema + RPC guards already cover.

Scope: three coupled files — LLM prompt, TS JSON schema, Postgres function. Four parallel Explore agents ran the four lenses. Auth-sensitive surface (RPC writes to user-owned tables) per supabase/README.md pre-apply checklist.

### Findings

FINDING 1
Severity: HIGH
Lens: architecture
Location: reference/prompt-session-end-v3.md (filename) + src/lib/session-end.ts:19 (import path)
Root cause: The prompt file was edited in-place rather than bumped to v4, despite a breaking JSON-shape change (breakthroughs: string[] → {content, note}[]). Filename "v3" now names two incompatible contracts depending on when it was read.
Blast radius: Operational confusion across git history and audit trails; `git log -- reference/prompt-session-end-v3.md` spans two shapes.
Suggested fix: Rename to prompt-session-end-v4.md; update the readFileSync path.
Status: FIXED (2026-04-24, d0e78ce) — renamed to prompt-session-end-v4.md, path updated in session-end.ts and next.config.ts comment. Glob pattern `prompt-*.md` in next.config.ts covers both so no bundling change.

FINDING 2
Severity: MED
Lens: architecture
Location: src/lib/session-end.ts:27-29 (SCHEMA ↔ DB COUPLING comment)
Root cause: Comment said "every field is read by public.process_session_end" — inaccurate after this PR because breakthroughs and style_calibration_delta are now nested structures, not flat strings/scalars. Future maintainers might miss the nested-extraction obligation.
Suggested fix: Update comment to call out nested fields and the dual-layer update obligation.
Status: FIXED (2026-04-24, d0e78ce) — comment rewritten to mention nested structure explicitly.

FINDING 3
Severity: MED
Lens: architecture
Location: supabase/migrations/20260424130000_process_session_end_coach_message.sql:58 (coach_message column write)
Root cause: No length cap on coach_message. Prompt says "1–3 sentences" but defense-in-depth is absent — a drifted LLM could write a 10KB coach_message into a `text` column with no constraint.
Blast radius: Cosmetic (bloated row, weird rendering) if the LLM ever drifts. Not a data-integrity issue.
Suggested fix: Cap via `left(..., 2000)` in the RPC before writing. Generous headroom for 1–3 sentences; rejects full-summary dumps.
Status: FIXED (2026-04-24, d0e78ce) — `nullif(left(p_analysis ->> 'coach_message', 2000), '')`.

FINDING 4
Severity: MED
Lens: architecture
Location: supabase/migrations/20260424130000_process_session_end_coach_message.sql (DOWN block)
Root cause: DOWN block only said "re-apply 20260423120000" without spelling out the operational steps or the subtlety that columns must not be dropped before the function is reverted.
Suggested fix: Expand the DOWN block with explicit revert procedure.
Status: FIXED (2026-04-24, d0e78ce) — DOWN block now lists the dashboard SQL-editor path and the column/function ordering requirement for a full rollback.

FINDING 5
Severity: MED
Lens: security
Location: supabase/migrations/20260424130000_process_session_end_coach_message.sql (function grant to service_role)
Root cause: service_role bypasses RLS; the cron's session-selection query is the sole gate on which sessions get analyzed. Pre-existing posture across every process_session_end version but not cross-referenced in the new migration's header.
Blast radius: Re-stated for the trail; no new trust surface introduced.
Suggested fix: Add a one-paragraph trust-boundary note to the new migration header so a cold reader doesn't need to go back to 20260423080000.
Status: FIXED (2026-04-24, d0e78ce) — header now includes the trust-boundary paragraph.

FINDING 6
Severity: LOW
Lens: architecture
Location: supabase/migrations/20260424130000_process_session_end_coach_message.sql (header ordering clause)
Root cause: Header said "timestamp ordering serializes correctly" but lacked an explicit "MUST land after 20260424120000" sentence.
Status: FIXED (2026-04-24, d0e78ce) — header now opens with an explicit DEPLOYMENT ORDERING block.

FINDING 7
Severity: LOW
Lens: correctness
Location: src/lib/session-end.ts (JSON.parse output cast to Record<string, unknown>)
Root cause: No TS-level runtime assertion that `breakthroughs` is `{content, note}[]` after parsing. Relies on OpenAI strict-mode schema + the RPC's `jsonb_typeof(elem) = 'object'` guard as defense-in-depth.
Suggested fix: Add a runtime validator (e.g. zod) OR explicitly document the strict-mode + RPC-guard defense-in-depth reliance.
Status: WON'T FIX (2026-04-24) — atomic strict-mode schema on OpenAI's side + RPC jsonb_typeof guard provide defense-in-depth. Introducing a runtime validator is an architectural decision (schema library adoption) larger than this PR. Revisit if we ever observe a schema-drift bug in the wild.

FINDING 8
Severity: LOW
Lens: security
Location: reference/prompt-session-end-v4.md (coach_message + breakthroughs.note as user-facing LLM-generated fields)
Root cause: Prompt injection via adversarial session transcripts could steer the LLM to emit phishing links or misleading content in these user-facing fields.
Blast radius: React default rendering auto-escapes HTML so classic XSS is gated. Markdown or link-preview rendering would amplify.
Suggested fix: Owned by the Home card renderer (Chunk 7) — URL allowlist or markdown-off policy.
Status: DEFERRED TO CHUNK 7 (2026-04-24) — not this PR's surface.

FINDING 9
Severity: LOW
Lens: security
Location: src/lib/session-end.ts (Sentry error payload)
Root cause: `failStage` passes `error.code` into `captureSessionError`. If Sentry config ever serializes full error objects, schema details could leak into Sentry issues.
Suggested fix: Verify Sentry beforeSend hook strips sensitive fields.
Status: OUT OF SCOPE — pre-existing behavior unchanged by this PR.

FINDING 10
Severity: LOW
Lens: data-integrity + security (3 lenses)
Location: supabase/migrations/20260424120000_home_extras_columns.sql (deployment ordering)
Root cause: Three lenses independently flagged the RPC-ahead-of-columns split-deploy hazard. Already documented in PR #53's header.
Status: WON'T FIX (2026-04-24) — duplicate of PR #53 FINDING 2. Same documentation-plus-timestamp-ordering mitigation applies; nothing new actionable.

FINDING 11
Severity: LOW
Lens: correctness
Location: supabase/migrations/20260424130000_process_session_end_coach_message.sql (silent-skip on non-object breakthroughs element)
Root cause: Per-element `jsonb_typeof(elem) = 'object'` guard silently skips non-object entries. Strict-mode schema prevents this in normal operation; the skip is defense-in-depth.
Status: WON'T FIX (2026-04-24) — intentional defensive behavior matching the parent-array guard pattern from 20260423120000. Surfacing a loud error on schema drift is a separate architectural decision.

## 2026-04-24 — /simplify on PR #57 (Top Goal card + 2-col grid)

Comment-cleanup applied in-place on the PR #57 files. Two larger
extractions surfaced but deferred — they touch 5–6 files outside this
PR and pre-date it, so they belong in their own reviewable chunk.

FINDING 1
Severity: LOW
Lens: architecture
Location: src/app/home/{LastSessionCard,MessageFromCoachCard,PersonalGrowthProgressCard,RecentBreakthroughsCard,TopGoalCard,YourMetricsCard}.tsx — all share `<section className="rounded-xl border border-white/10 bg-white/[0.02] p-5">` (or `p-4` variant)
Root cause: Six home cards duplicate the same outer-section class string. One more and we've hit the point where updating the card look requires touching six files.
Blast radius: Maintenance-only; no correctness or security impact. Future design tweaks (e.g. changing card background opacity, border radius, default padding) require six-file edits with drift risk.
Suggested fix: Extract a `<HomeCard>` wrapper component in `src/app/home/_components/` that accepts `children` and optional `className` to layer padding variants. Six-file mechanical refactor, no behavior change.
Status: OPEN — deferred; worth its own small PR after the Home page is feature-complete (currently mid-build).

FINDING 2
Severity: LOW
Lens: architecture
Location: same six home card files — identical `<div className="flex items-center gap-3"><svg ... className="h-5 w-5 ... text-brand-primary" ... /><h2 ... /></div>` header pattern (icon size 4–7 varies, but structure is identical)
Root cause: Five of the six cards repeat the header pattern. Companion to Finding 1.
Blast radius: Same maintenance burden as Finding 1.
Suggested fix: Bundle a `<CardHeader icon={...} title="...">` into the same `HomeCard` extraction. Consider as one PR with Finding 1.
Status: OPEN — deferred; bundle with Finding 1.

FINDING 3
Severity: LOW
Lens: correctness (efficiency)
Location: src/app/home/page.tsx:206-218 — `getOnboardingState()` awaited sequentially before `loadHomeData()`
Root cause: The two awaits are independent data fetches (onboarding row vs. the five Supabase reads in loadHomeData), so the home page takes the sum of both round-trips instead of the max. Pre-dates PR #57; PR #57 just added `topGoalFromOnboarding(state)` after the sequence.
Blast radius: One extra Supabase round-trip per home-page render (~50–200 ms depending on region). Edge case: if onboarding is incomplete we redirect, so parallelizing would waste loadHomeData's queries for that minority of visits.
Suggested fix: `const [state, homeData] = await Promise.all([getOnboardingState(), loadHomeData()]);`. Accept the wasted query on incomplete-onboarding redirect (one-time per user).
Status: OPEN — small, contained fix; not urgent, can be bundled with any future home-page perf pass.

## 2026-04-24 — /simplify on PR #65 (/next-steps page) — deferred pattern-debt

Surfaced by the PR #65 /simplify review. Out of scope for that PR but
worth tracking so it doesn't get forgotten.

FINDING 1
Severity: LOW
Lens: architecture
Location: src/app/home/page.tsx, src/app/sessions/page.tsx, src/app/sessions/[id]/page.tsx, src/app/progress/page.tsx, src/app/goals/page.tsx, src/app/goals/new/page.tsx, src/app/settings/page.tsx, src/app/next-steps/page.tsx, src/app/goals/new/actions.ts (createGoal + addPredefinedGoal)
Root cause: Every signed-in page repeats the identical gate:
```tsx
const session = await auth();
if (!session?.userId) redirect("/sign-in");
const onboarding = await getOnboardingState();
if (!isOnboardingComplete(onboarding)) redirect("/onboarding");
```
Nine near-identical blocks (seven pages + two server actions). Adding a tenth surface means copying the block again; any change to the auth-gate contract (new redirect target, logged warnings, extra checks) requires nine file edits with drift risk.
Blast radius: Maintenance-only. The realistic failure is drift across pages — one page missing a step and silently showing content the gate should have blocked.
Suggested fix: Extract `requireOnboardedUser()` (or `{ userId, state }`) in `src/lib/auth-gate.ts`. Each page/action becomes a one-liner at the top. Pages that also want the raw Clerk session can still call `auth()` alongside. Consider pairing with the HomeCard / CardHeader cleanup on pages that also use those, since the top-of-file diff is already being touched.
Status: OPEN — standalone `refactor: require-onboarded-user helper` PR when convenient.

## 2026-04-25 — Audit (scope: main..feat/goals-schema) — PR #70

### Summary

13 findings total: 0 CRITICAL, 3 HIGH, 5 MED, 5 LOW. The two HIGH items collapse into one root fix (the unique-title partial index keyed off archived_at instead of is_predefined); applied inline in commit 7a3be4b. Remaining HIGH (cross-component next_steps semantics) is not actionable — confirmed feature behavior, documented in this PR's commit message. Remaining MED / LOW findings either pushed back as false positives, deferred to G.2/G.3 audits, or accepted by design with rationale captured.

Scope: one schema migration (`supabase/migrations/20260425090000_goals_table.sql`) — adds `public.goals` table, three RLS policies, four indexes (one a unique partial), CHECK constraint, updated_at trigger, plus `next_steps.goal_id` nullable FK. Four parallel Explore agents ran the four lenses per `Docs/review-cadence/audit-prompt-template.md`.

### Findings

FINDING 1
Severity: HIGH
Lens: data-integrity
Location: supabase/migrations/20260425090000_goals_table.sql (unique partial index, original WHERE is_predefined = true)
Root cause: Original index `goals_user_predefined_title_uniq` keyed off `is_predefined`. A user-added goal with `is_predefined=false` could share a title with a seeded goal (`is_predefined=true`) because the partial WHERE excluded user-added rows from uniqueness — producing duplicates when /goals/new raced the lazy seed.
Suggested fix: Re-key the index on `archived_at IS NULL`. Two active goals can't share a title regardless of origin; archived goals can be re-titled freely.
Status: FIXED (2026-04-25, 7a3be4b) — index renamed to `goals_user_active_title_uniq`.

FINDING 2
Severity: HIGH
Lens: correctness
Location: supabase/migrations/20260425090000_goals_table.sql (is_predefined column, no UPDATE restriction)
Root cause: `is_predefined` is mutable via the `goals_update_own` policy. With the original partial-index design, a user could flip the column to break the lazy-seed idempotency invariant.
Status: FIXED (2026-04-25, 7a3be4b) — collapsed into FINDING 1's fix. Index no longer depends on `is_predefined`, so mutability is informational only.

FINDING 3
Severity: HIGH
Lens: architecture
Location: supabase/migrations/20260425090000_goals_table.sql (next_steps dual semantics — session_id NOT NULL + goal_id nullable)
Root cause: Goal cards query `WHERE goal_id = X` returns next_steps rows from any session that touched that goal — cross-session "current next-step" surface. Agent flagged this as a query-contract gap.
Blast radius: Behaved-as-intended.
Suggested fix: Document the contract.
Status: WON'T FIX (2026-04-25) — feature, not bug. Goal cards intentionally show the most-recent next_step across all sessions for that goal (history preserved on /next-steps page). Documented in this PR's commit message; G.2's RPC PR will add a code comment alongside the INSERT.

FINDING 4
Severity: MED
Lens: security
Location: supabase/migrations/20260425090000_goals_table.sql (unique partial index timing side-channel)
Root cause: Agent posited that a malicious authenticated user could probe whether (user_id, title) exists for another user via INSERT-timing on the unique partial index.
Blast radius: None reachable.
Status: WON'T FIX (2026-04-25) — false positive. The `goals_insert_own` RLS policy uses `WITH CHECK user_id = auth.jwt()->>'sub'`, so a malicious user can't even attempt to insert a row with another user's `user_id`. The partial index only fires on the attacker's own rows; no cross-user signal exists.

FINDING 5
Severity: MED
Lens: security
Location: supabase/migrations/20260425090000_goals_table.sql (G.2 forward concern — service_role bypasses RLS)
Root cause: `process_session_end` is granted to both `authenticated` and `service_role`. service_role bypasses RLS by design (cron sweep). When G.2 extends the RPC to UPDATE goals, the body must be careful to scope writes to the owning user — RLS won't enforce it under service_role.
Status: OPEN — deferred to G.2 implementation. The G.2 RPC migration MUST include a cross-user-isolation guard (`UPDATE ... WHERE user_id = v_user_id` derived from the session, not relying on RLS), and the G.2 audit prompt will explicitly verify this.

FINDING 6
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260425090000_goals_table.sql (status enum, no auto-archive when goal complete)
Root cause: A goal at `status='on_track'` can stay there indefinitely; no auto-archive when an LLM judges completion. UX result: long-completed goals look "active".
Status: WON'T FIX (2026-04-25) — explicit product decision. Most coaching goals are practices, not terminal achievements. Goals exit the active list via user-initiated `archived_at`. Terminal goals (find_romantic_partner, change_careers) exit the same way — the LLM coach_message can suggest archiving when it observes a milestone, but the user always decides.

FINDING 7
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260425090000_goals_table.sql (lazy seed concurrency contract)
Root cause: G.3's lazy-seed helper must use `INSERT ... ON CONFLICT (user_id, title) DO NOTHING` to be race-safe under the unique partial index.
Status: OPEN — deferred to G.3 implementation. The G.3 PR will explicitly use the ON CONFLICT clause and the G.3 audit will verify it.

FINDING 8
Severity: MED
Lens: architecture
Location: supabase/migrations/20260425090000_goals_table.sql (lazy seed home — src/lib/goals.ts vs onboarding.ts vs goals-seed.ts)
Root cause: Migration header references `src/lib/goals.ts` for the lazy seed; that file doesn't exist yet. Architecture lens flagged the architectural home as unresolved.
Status: OPEN — deferred to G.3. Plan: create `src/lib/goals.ts` as the home for goal-related TS helpers (lazy seed + read helpers can co-locate). If the file grows large, split later.

FINDING 9
Severity: LOW
Lens: security
Location: supabase/migrations/20260425090000_goals_table.sql (CHECK constraint enumerability)
Root cause: Adding a 4th status value later requires both a migration and an application code change. Documentation suggestion.
Status: WON'T FIX (2026-04-25) — accepted. Future status additions will land in a coupled PR (migration + TS schema + prompt rule) like the coach_message wiring in PR #55.

FINDING 10
Severity: LOW
Lens: security
Location: supabase/migrations/20260425090000_goals_table.sql (Clerk webhook failure mode)
Root cause: Goals leak forever if the Clerk user.deleted webhook fails. Recovery concern, not security.
Status: WON'T FIX (2026-04-25) — accepted, captured by the existing 2026-04-22 PR #53 audit FINDING 4 ("verify deletion webhook E2E"). Already in the ledger as OPEN.

FINDING 11
Severity: LOW
Lens: correctness
Location: supabase/migrations/20260425090000_goals_table.sql (status state-machine permissive)
Root cause: Schema allows any transition (e.g., not_started → at_risk directly).
Status: WON'T FIX (2026-04-25) — intentional. The LLM may legitimately observe early drift and skip the on_track state. Schema-level state machines are over-engineering at this stage.

FINDING 12
Severity: LOW
Lens: correctness
Location: supabase/migrations/20260425090000_goals_table.sql (smallint sizing on progress_percent + no text caps)
Root cause: smallint is 2 bytes for a 0-100 value (oversized but harmless); progress_rationale and description have no length cap.
Status: WON'T FIX (2026-04-25) — text caps belong at write time in G.2's RPC, matching the `left(p_analysis ->> 'coach_message', 2000)` pattern from 20260424130000. Schema stays minimal.

FINDING 13
Severity: LOW
Lens: architecture
Location: supabase/migrations/20260425090000_goals_table.sql (dual indexing — partial active + full chronological)
Root cause: `goals_user_active_idx` partial + `goals_user_created_idx` full overlap on the active subset.
Status: WON'T FIX (2026-04-25) — intentional. Partial optimizes the common Goals tab list query; full serves the future Archived view. Drop the full one in a follow-up if profiling later shows it unused.

## 2026-04-25 — Plan-level review (Goals phase G.1-G.5) — 3 HIGH issues, all addressed

A fresh-session reviewer pressure-tested the entire Goals phase plan (not just G.1's diff) and surfaced three HIGH issues the per-PR audits had missed:

PLAN-FINDING 1 (HIGH)
Lens: data-integrity
Root cause: G.3's lazy seed and G.4's createGoal both planned to INSERT a "starter" next_step at goal-creation time. But `next_steps.session_id` was declared NOT NULL in 20260422170000, AND the RLS WITH CHECK required session_id IN (caller's sessions). Both would have failed at runtime since starter inserts have no session in scope.
Status: FIXED via PR #71 (G.1.5) — `ALTER COLUMN session_id DROP NOT NULL` + `next_steps_insert_own` updated to permit `session_id IS NULL` rows scoped by user_id.

PLAN-FINDING 2 (HIGH)
Lens: correctness
Root cause: Lazy seed was planned to run only on `/goals` visit. A user who completes onboarding and starts a coaching session before opening the Goals tab would have hit empty goals in the session-start prompt — a regression vs the current behavior of reading from `onboarding.top_goals`. The session-end LLM would then emit `updated_goals[]` with goal_ids that don't exist, and the RPC silently drops them — first session is wasted from a goals-tracking perspective.
Status: TO FIX in G.2 — call `loadActiveGoalsWithLazySeed(userId)` from `startSession` in `src/app/sessions/actions.ts` before `buildSessionStartInput`. Idempotent (`INSERT ... ON CONFLICT DO NOTHING` against the unique partial index from PR #70), so calling from /goals + Home + startSession is safe.

PLAN-FINDING 3 (HIGH)
Lens: security
Root cause: Restated PR #70 audit FINDING 5 with concrete language. G.2's RPC will be invoked under both `authenticated` (RLS-gated) and `service_role` (RLS bypass) per the existing grant pattern. Under service_role, `auth.jwt()->>'sub'` is NULL, so any goal UPDATE that relies on RLS for cross-user isolation can be defeated.
Status: TO FIX in G.2 — RPC body must derive `v_user_id := (SELECT user_id FROM sessions WHERE id = p_session_id)`, then `UPDATE goals ... WHERE id = ANY(...) AND user_id = v_user_id AND archived_at IS NULL`. Same defensive shape as the existing breakthroughs path. The G.2 PR's audit prompt will explicitly verify this WHERE clause.

Plus four MED items captured forward:

PLAN-FINDING 4 (MED) — Cross-session goal-state staleness. Goals not discussed in N sessions stay frozen. Status: WON'T FIX for v1 (defer to post-launch observation; possible mitigations: `last_evaluated_at`, gray-out cards after N days, or pass age into prompt).

PLAN-FINDING 5 (MED) — G.2 partial-rollback hazard. Five-layer coupled change (prompt-coaching-chat / session-start assembly / prompt-session-end-v5 / TS schema / RPC migration). Mitigation: prompt-session-end becomes v5.md (file rename forces matched read), TS schema bump lands in same PR as RPC migration, deploy ordering documented in migration header. Same lesson as PR #55.

PLAN-FINDING 6 (MED) — G.3 ships +Add / Edit / Archive icons before G.4 / G.5 implement them. Status: ADJUSTED PLAN — G.3 ships read-only cards; edit/archive icons land in G.5's PR. Cleaner than feature flags.

PLAN-FINDING 7 (MED) — GDPR/right-to-be-forgotten on archived goals. `progress_rationale` and free-text fields can contain PII. Today's only deletion path is full-account-delete via Clerk webhook. Status: OPEN, defer to >10-tester gate alongside the existing 2026-04-22 PR #53 FINDING 4 (deletion-webhook E2E verification).

## 2026-04-25 — Audit (scope: main..feat/next-steps-nullable-session) — PR #71

### Summary

Three parallel lens audits (security, data-integrity, correctness+architecture combined). Zero actionable findings on the migration itself. One forward note for G.3's lazy-seed code (add inline comment documenting the NULL session_id contract). Several agent findings rejected as based on incorrect premises (no auto-generated TS types in this repo; DOWN-block convention is documented; "CRITICAL" rating on documented manual-verify pattern was overblown).

Scope: one migration (`supabase/migrations/20260425100000_next_steps_nullable_session.sql`) — `ALTER COLUMN next_steps.session_id DROP NOT NULL` + replace `next_steps_insert_own` RLS to permit `session_id IS NULL` rows. PR fixes the HIGH issue surfaced by the 2026-04-25 plan-level review.

### Findings

FINDING 1
Severity: LOW
Lens: security
Location: header comment
Root cause: Agent suggested a one-sentence clarification that "session_id is still enforced NOT NULL in the FK constraint." That's factually wrong — Postgres FK constraints don't have NOT NULL semantics; nullable FKs are standard.
Status: WON'T FIX (2026-04-25) — agent's premise is incorrect; existing comment already explains the semantic clearly.

FINDING 2
Severity: MED
Lens: data-integrity (forward note for G.3 code)
Location: future src/lib/goals.ts (lazy seed) and src/app/goals/new/actions.ts (createGoal)
Root cause: New RLS policy permits NULL session_id without verifying session ownership for that row (intentional — NULL means "system-generated starter"). Future starter-insert code paths must enforce the contract that NULL session_id is only used for system-generated starters, not as a way to bypass session-ownership checks.
Status: OPEN — carry forward to G.3 / G.4 PRs. Inline code comment will document the contract at the insertion sites.

FINDING 3
Severity: MED (rejected)
Lens: data-integrity / cross-runtime consistency
Location: TypeScript Supabase types
Root cause: Agent worried that auto-generated Supabase types might declare session_id as non-nullable UUID, rejecting NULL inserts at the type layer.
Status: WON'T FIX (2026-04-25) — this repo doesn't use auto-generated Supabase types (verified via grep on `Database`, `generated`, `schema.types`). Untyped Supabase client in use; nullable-column changes are TS-safe.

FINDING 4
Severity: MED
Lens: data-integrity (semantic drift)
Location: future code that writes next_steps
Root cause: Future bulk UPDATE that assigns session_id to previously-NULL rows would break the "NULL = system-generated starter" contract.
Status: OPEN — enforce by code review going forward. The starter-vs-session-derived distinction is part of the next_steps semantic contract.

FINDING 5
Severity: CRITICAL (rejected — agent miscategorized)
Lens: data-integrity
Location: DOWN block manual-verify step
Root cause: Agent rated "CRITICAL" because the DOWN block requires manual SELECT verification before re-adding NOT NULL.
Status: WON'T FIX (2026-04-25) — Supabase CLI doesn't run DOWN blocks automatically; manual-verify is the documented project convention. The DOWN block IS already comment-blocked and includes the SELECT step. "CRITICAL" rating is overblown for a documented manual operator path.

FINDING 6
Severity: LOW
Lens: correctness
Location: RLS WHERE clause comment
Root cause: Agent suggested expanding the comment to explicitly mention Postgres three-valued logic (NULL IN (...) = UNKNOWN, falsy; IS NULL short-circuits to TRUE).
Status: WON'T FIX (2026-04-25) — accepted. The IS NULL is correct; future maintainers reading the policy can refer to Postgres docs. Minor doc-polish, not worth the churn.

FINDING 7
Severity: LOW
Lens: data-integrity (TOCTOU)
Location: ALTER COLUMN takes ACCESS EXCLUSIVE lock
Root cause: DDL serialization with concurrent INSERTs.
Status: WON'T FIX (2026-04-25) — sub-second lock on dev/prod, accepted by the agent itself.

## 2026-04-25 — Audit (scope: main..feat/goals-rpc-prompt-coupling) — PR #72

### Summary

Three parallel lens audits (security; data-integrity; correctness+architecture combined) on the five-layer coupled change. Agents surfaced 20 findings total — 2 actionable, 5 deferred forward, the rest rejected as fail-soft-by-design, observability concerns belonging to Sentry (Phase 10), or already-gated by existing controls.

Two inline fixes applied in commit during this PR:
  - Narrowed RPC's `exception when others` to `when invalid_text_representation` (security F1).
  - Added runtime `if (!userId) throw` guard in `loadActiveGoalsWithLazySeed` (security F3).

Agent verbosity was high — many "CRITICAL"/"HIGH" ratings were overblown for fail-soft-by-design behavior. Pushed back with explicit rationale below.

### Findings

FINDING 1 (security HIGH)
Location: supabase/migrations/20260425110000_process_session_end_with_goals.sql (UUID parse exception)
Status: FIXED (2026-04-25, this PR) — replaced `exception when others` with `when invalid_text_representation` so only UUID-cast failures are caught; anything else (deadlock, network) bubbles.

FINDING 2 (security HIGH)
Location: src/lib/goals.ts loadActiveGoalsWithLazySeed
Root cause: Agent flagged ctx.userId fragility — a future refactor that drops userId could silently corrupt seed.
Status: FIXED (2026-04-25, this PR) — runtime guard `if (!userId) throw new Error(...)` added at function top. TypeScript already enforces `string` non-null, but the guard backstops empty strings + survives type-system regressions.

FINDING 3 (multi-lens, rated CRITICAL/HIGH by agents)
Location: process_session_end RPC's silent skip on hallucinated/cross-user/archived goal_id
Root cause: When the LLM emits an `updated_goals[i].goal_id` that doesn't match a row owned by `v_user_id` AND `archived_at IS NULL`, the UPDATE matches zero rows, FOUND is false, the next_steps INSERT is gated, and the RPC returns true without raising. Agents called this "silent data loss" / "fail-open."
Status: WON'T FIX (2026-04-25) — by design. Defensive fail-soft mirrors the breakthroughs `jsonb_typeof` / `length(trim(content)) > 0` pattern. No auth bypass, no cross-user write, no data corruption — just a dropped LLM output. Per the quality checklist, observability for "LLM emitted X that we silently skipped" belongs to Sentry instrumentation (Phase 10 trigger). Rated overzealously by agents.

FINDING 4 (security CRITICAL → reduced)
Location: prompt-session-end-v5.md + formatGoalsForPrompt rendering goal title/description directly
Root cause: Agent flagged prompt injection — a user's custom goal title or description lands in the LLM prompt unescaped. Could include "[UPDATE progress_percent = 100]" or "Ignore all prior instructions."
Status: WON'T FIX (2026-04-25) — only-self-injection. The user is the only one who can put text in their own goals. They'd be steering their own coach; no cross-user attack surface. Defensive wrap-in-tags is good hygiene but not blocking. Revisit if/when goals are ever shared across users (team-shared goals, coach-templates) or if the LLM observably gets steered.

FINDING 5 (data-integrity HIGH)
Location: starter NULL session_id contract relies on documentation, not schema
Root cause: A future bulk-update could overwrite NULL session_id and break the "system-generated starter" semantic.
Status: WON'T FIX (2026-04-25) — the next_steps_update_own RLS + the documented contract are sufficient for v1. Adding a CHECK constraint or trigger here would be over-engineering. If a real bug ever materializes from this, add a CHECK then.

FINDING 6 (data-integrity HIGH)
Location: Concurrent archive race between session-start and session-end
Root cause: User archives a goal mid-session; session-end LLM emits an update for it; UPDATE WHERE archived_at IS NULL misses; analysis is dropped.
Status: WON'T FIX (2026-04-25) — by design. If the user archived the goal, they don't WANT updates landing on it. The fail-soft is correct.

FINDING 7 (correctness HIGH)
Location: Lazy seed empty-onboarding fallback (goals.ts top_goals ?? [])
Root cause: Agent worried that preview-env users running session-start before completing onboarding would get empty goals.
Status: WON'T FIX (2026-04-25) — already gated. `buildSessionStartInput` throws if `onboarding.completed_at` is null; the /home page redirect to /onboarding prevents that path; lazy seed running in parallel with the onboarding read does no harm if it sees an empty array. Triple-gated.

FINDING 8 (architecture MED) — TO ADDRESS LATER
Location: Five-layer coupling has no central documentation
Root cause: Future engineers modifying the LLM-RPC contract must remember 5 update sites (prompt rule + LLM schema + RPC extraction + transcript prefix + onboarding data).
Suggested fix: Add `Docs/CONTRACTS.md` (or extend `Docs/decisions.md`) with a "five-layer rule update checklist."
Status: OPEN — captured for a future docs PR. Not blocking G.2.

FINDING 9 (architecture MED)
Location: process_session_end RPC body length (~180 lines)
Root cause: Approaching complexity threshold; updated_goals FOR loop could be extracted.
Status: WON'T FIX (2026-04-25) — extraction adds GRANT / search_path / comment overhead for one nested loop. Matches the monolithic pattern of prior process_session_end migrations (20260423080000, 20260423120000, 20260424130000). Revisit if another nested section lands.

FINDING 10 (data-integrity MED)
Location: Duplicate starter rows from concurrent lazy seeds
Status: WON'T FIX (2026-04-25) — documented as cosmetic in goals.ts; race window is narrow (two tabs of same user within ms). If duplicates appear in real usage, add a unique constraint on (goal_id, content) WHERE status='pending' AND session_id IS NULL.

FINDING 11 (correctness MED)
Location: Goal description has no schema cap (text type)
Status: WON'T FIX (2026-04-25) — text caps belong at write time. G.4's createGoal server action will validate input length; the prompt rendering already truncates to 200 chars for token-budget. Schema stays minimal.

FINDING 12-20 (LOW + accepted-with-rationale)
Various code-style / observability suggestions (RAISE NOTICE on skip, sanitize prompt content, document contract in code comment, etc.). All deferred or acknowledged as defense-in-depth not blocking. See agent transcripts for individual rationales.

### Cron path verification (security F12)

Agent flagged that the abandonment-cron context construction wasn't visible. Confirmed: `src/app/api/cron/sweep-stale-sessions/route.ts:164` and `:179` both pass `{ client: admin, userId: s.user_id }` where `s.user_id` is read from the sessions row (line 58 SELECT). Service-role bypasses RLS but `v_user_id` derivation in the new RPC is from `sessions.user_id` (the function's own SELECT), not from the JWT. Both paths agree on the user. New runtime guard in `loadActiveGoalsWithLazySeed` catches any future regression.

## 2026-04-25 — Audit (scope: main..feat/goals-add-flow) — PR #74

### Summary

Four parallel Explore agents per `Docs/review-cadence/audit-prompt-template.md`, scope: three new files in `src/app/goals/new/` (no schema, no RLS change). Cross-lens consolidation:

- **2 fixes addressed inline in PR #74** before merge: server-action onboarding gate (was bypassable via direct POST) and TITLE_MAX/DESCRIPTION_MAX dedup (was duplicated in client + server).
- **Several deferred-acceptable patterns** (non-atomic two-table write, missing Sentry tagging, prompt-injection on own session, no createGoal rate limit) — already documented in code or earlier audits, no v1 fix.
- **Two findings pushed back on inflated severity** (Security CRITICAL #13 expired-token scenario, actually LOW; Security HIGH #2 rate limit pre-launch, practical LOW).

### Findings

FINDING 1
Severity: HIGH
Lens: correctness + architecture (both lenses raised independently)
Location: src/app/goals/new/actions.ts:38-43 (pre-fix)
Root cause: createGoal server action checks auth() but not isOnboardingComplete(). The page (page.tsx:28-29) checks both. Server actions are independently callable via direct POST or replay, so a partially-onboarded user could bypass the page guard and create a goal before onboarding completes.
Blast radius: User in mid-onboarding can populate goals before coaching context (onboarding_selections) is fully persisted. Not a security issue, but violates the gating contract and could leave the LLM seeing goals without the onboarding signals it expects.
Suggested fix: Mirror the page guard — call getOnboardingState() + isOnboardingComplete() before Supabase access in the action.
Status: FIXED (2026-04-25, pending commit on feat/goals-add-flow) — onboarding gate added immediately after the auth check in createGoal.

FINDING 2
Severity: MED
Lens: correctness + architecture
Location: src/app/goals/new/actions.ts:13-14 + src/app/goals/new/NewGoalForm.tsx:13-14 (pre-fix)
Root cause: TITLE_MAX = 200 and DESCRIPTION_MAX = 1000 defined in two files. Drift between client maxLength and server validation would surface as a confusing UX (client allows input the server rejects, or vice versa).
Blast radius: Maintenance hazard. No production bug today.
Suggested fix: Extract to a single source of truth. src/lib/goals.ts is server-only and can't be imported by the client form, so a new module without "use server" / "use client" is the cleanest fit.
Status: FIXED (2026-04-25, pending commit on feat/goals-add-flow) — extracted to src/app/goals/new/limits.ts; both files now import from there.

FINDING 3
Severity: HIGH (data-integrity lens) / MED (security + correctness lenses)
Lens: data-integrity
Location: src/app/goals/new/actions.ts:89-108
Root cause: Goal INSERT and starter next_step INSERT are non-atomic. Goal succeeds, starter can fail; on failure the action logs to console.error and still redirects to /goals, leaving the goal without a starter action.
Blast radius: User sees their newly-created goal in /goals but the Suggested Next Steps list is empty for it until the next session-end LLM write. UX degraded, not data loss.
Suggested fix: Wrap both inserts in a Postgres function (pattern: process_session_end) so they commit/abort atomically. Or, until that lands, raise on starterRes.error and let the user retry — but that path produces orphan-goal-on-retry duplication which the unique partial index would surface as a 23505. Trade-off priced into v1 per the inline comment on actions.ts:90-94.
Status: WON'T FIX (2026-04-25) — accepted v1 trade-off; reschedule to a future Goals phase that introduces a create_goal_with_starter RPC. Logged here so the trail is auditable.

FINDING 4
Severity: HIGH (security agent) reduced to LOW (operator triage)
Lens: security
Location: src/app/goals/new/actions.ts (server action, no rate limit)
Root cause: No per-user cap on createGoal. A user could spam-create thousands of goals.
Blast radius: Pre-launch + auth-required + self-only-blast = practical LOW. The Goals tab + session-start prompt assembly would degrade for that user; no cross-user impact, no leak. Severity reduced from HIGH to LOW on operator triage.
Suggested fix: Add a soft per-user goal cap (e.g., 100 active goals) checked before INSERT. Defer to post-launch when usage telemetry is available.
Status: OPEN (deferred to post-launch).

FINDING 5
Severity: CRITICAL (security agent) reduced to LOW (operator triage)
Lens: security
Location: src/app/goals/new/actions.ts:42-43, src/lib/supabase.ts (Clerk-Supabase token bridge)
Root cause: Agent claimed an expired-but-truthy Clerk JWT could pass supabaseForUser() and produce a Postgres permission error on INSERT, which isn't caught by the 23505 handler and bubbles as an unhandled exception leading to a 500.
Blast radius: Bad UX (500), not a security boundary failure. RLS still fails closed; nothing leaks. Severity reduced from CRITICAL to LOW.
Suggested fix: Once Sentry is wired (Phase 10), tag any non-23505 Supabase error in createGoal so token-validity issues surface in alerts.
Status: OPEN (deferred to Phase 10 Sentry wiring).

FINDING 6
Severity: MED
Lens: data-integrity
Location: src/app/goals/new/actions.ts:75-88 (archive-vs-active title race)
Root cause: Unique partial index (user_id, title) WHERE archived_at IS NULL permits re-creating an archived goal title. Concurrent submits — one new, one re-add — can produce a brief friendly "already exists" error to the re-add even though the row they are re-adding is archived.
Blast radius: UX papercut. No data corruption (Postgres serializes via the index).
Status: WON'T FIX (2026-04-25) — by design, documented in actions.ts:30-34 (Race tolerance comment).

FINDING 7
Severity: LOW
Lens: security
Location: src/app/goals/new/actions.ts:81-87 (raw Supabase error leaks if non-23505)
Root cause: Non-23505 Supabase errors are thrown unhandled; if the error message ever surfaces to the client (depends on Next.js error-boundary behavior), Postgres internals could leak.
Blast radius: Information disclosure to a sophisticated attacker mining error patterns. Defensive-only.
Suggested fix: Wrap in try/catch at the action boundary; map all unhandled errors to a generic user-facing string.
Status: OPEN (defense-in-depth, defer until Sentry wiring lands).

FINDING 8
Severity: MED
Lens: security
Location: src/app/goals/new/actions.ts (goal title flows into LLM prompt via formatGoalsForPrompt)
Root cause: Goal title and description are inserted verbatim into the session-start prompt. A user crafting an injection-style title can attempt to steer their own coach.
Blast radius: Self-injection only — no cross-user attack. If goals ever become shared (team coaching, manager-assigned, shared templates), this becomes HIGH.
Status: OPEN (DUPLICATE of 2026-04-23 audit FINDING 10 — same prompt-injection pattern, same defer rationale).

FINDING 9
Severity: LOW
Lens: architecture
Location: src/lib/goals.ts:74 (re-exports CUSTOM_GOAL_GENERIC_STARTER from @/app/onboarding/data)
Root cause: Constant lives in the UI layer (onboarding/data.ts) but is consumed by server domain logic. Direction-of-dependency smell; if onboarding/data.ts is refactored, lib/goals.ts breaks.
Blast radius: None operationally.
Status: OPEN (low priority; address if onboarding/data.ts is restructured).

FINDING 10
Severity: LOW
Lens: misc — multiple smaller items not worth individual entries
Root cause: Various code-style / observability suggestions across all four lenses — auth-check duplication between page.tsx and actions.ts (defense-in-depth, intentional), CreateGoalState return type unreachable on happy path (redirect throws), Clerk null-result tagging gap (Sentry-deferred), client-side maxLength matches but no client-side error message on overflow, etc. None blocking.
Status: OPEN (acknowledged; case-by-case if any becomes a real issue).

## 2026-04-26 — /simplify review of PR #73 (G.3 Goals tab rebuild)

Three parallel agents (reuse, quality, efficiency). Six concrete fixes applied; two efficiency findings deferred.

### Fixes applied (this branch)

1. Extracted `<ProgressBar percent={n}>` into `src/app/_components/ProgressBar.tsx` — three identical 7-line bar markups in GoalCard.tsx, TopGoalCard.tsx, PersonalGrowthProgressCard.tsx now share the component (matches the icons.tsx 3+-uses convention).
2. `GoalCardData` rewritten as `Pick<ActiveGoal, ...> & { ...derived }` — drops the duplicated status union and 6 redundant field declarations.
3. Dropped dead `description` field from `GoalCardData` (and from buildCardData's return map) — the field was never read by GoalCard's JSX.
4. `TopGoalCard` prop changed from a 3-field subset shape to `ActiveGoal | null`. Home page's `topGoalCardData` mapper deleted; `activeGoals[0] ?? null` is the entire derivation.
5. Stripped audit/PR/phase references from comments per the no-audit-refs feedback rule: TopGoalCard's "As of G.3 the card now renders…" header block, goals/page.tsx's "+Add button links to /goals/new which lands in G.4…" comment, home/page.tsx's "loadActiveGoalsWithLazySeed handles the onboarding → public.goals seed lazily…" trail and the "v1 picks 'newest' as Top; a future chunk may add an explicit Top flag…" forward-looking comment.
6. Stripped a WHAT-narrating comment block at goals/page.tsx (above buildCardData) — the code is self-evident.

### Deferred (efficiency findings — pre-existing, not introduced by #73)

FINDING 1
Severity: LOW
Lens: efficiency
Location: src/lib/goals.ts:142-244 (loadActiveGoalsWithLazySeed)
Root cause: The helper unconditionally re-fetches the goals list after the INSERT branch, and unconditionally fetches next_steps to backfill starters — even when `missing.length === 0` and no predefined goal lacks a starter. Steady-state every Home + /goals + session-start render performs 4 sequential round-trips when 1 (the initial existingRes SELECT) would suffice.
Blast radius: Latency only. Material at p95 once user count grows; immaterial at 1-user / pre-launch scale.
Suggested fix: Skip the re-fetch when `missing.length === 0` (use `existingActive` directly). Skip the next_steps backfill SELECT when no `is_predefined` goal is unseen (already true after the first call for any user with predefined goals — verify with a count guard).
Status: OPEN (deferred; revisit when usage telemetry is in or before Phase 10 pre-launch gate).

FINDING 2
Severity: LOW
Lens: efficiency
Location: src/app/goals/page.tsx:44-49 (buildCardData next_steps fan-out)
Root cause: `.in("goal_id", goalIds)` with no LIMIT pulls every step row across all active goals just to keep the most recent per goal. At >50 active goals × tens of steps each, this becomes wasteful.
Blast radius: At 1-user / ≤10-tester scale, payload is realistically <100 rows. Theoretical at current scale.
Suggested fix: Move to a Postgres view/RPC `select distinct on (goal_id) ... order by goal_id, created_at desc` once a real user accumulates >50 active goals or >50 steps per goal.
Status: OPEN (deferred until user telemetry shows it matters).

## 2026-04-26 — Cross-cutting deferred finding: redundant auth() in goals actions

FINDING 1
Severity: LOW
Lens: efficiency
Location: src/app/goals/actions.ts (archiveGoal), src/app/goals/new/actions.ts (createGoal, addPredefinedGoal), src/app/goals/[id]/edit/actions.ts (updateGoal)
Root cause: The standard goals-action prelude — `auth()` → `getOnboardingState()` → `supabaseForUser()` — does 3 separate `auth()` calls per click. `getOnboardingState()` and `supabaseForUser()` each call `auth()` internally on top of the explicit top-level redirect-gate. Two of the three are redundant.
Blast radius: One extra Clerk round-trip per server-action invocation. Negligible at 1 user / ≤10 testers; would be material at scale.
Suggested fix: Wrap `auth()` once at the lib layer with React's `cache()` (request-scoped memoization). `supabaseForUser` already documents the round-trip-avoidance pattern in its docstring (`src/lib/supabase.ts:36`) — this is finishing that work, not a new pattern. Single edit; no action-file changes.
Status: OPEN (deferred; revisit before Phase 10 pre-launch gate or if Clerk per-call latency becomes user-visible).

## 2026-04-26 — Process gap: PRs with migrations briefly break prod

FINDING 1
Severity: MED
Lens: operator
Location: Workflow gap between `gh pr merge` and `supabase db push --project-ref <prod>`
Root cause: Code on main is auto-deployed by Vercel to innerverse-prod the moment a PR with a schema migration merges. The migration itself is not auto-applied — it has to be pushed manually via Supabase CLI. Until that happens, prod runs new code against the old schema. Any code path that writes to a renamed/added column 500s in production.
Blast radius: User-visible failures on the affected code path for the duration of the gap (typically minutes if the operator is paying attention; longer if the merge happens unattended). Hit on PR #89 — `session_feedback.tone_rating` was missing in prod for ~3 minutes between merge and prod push. No real-user impact at current scale (1 operator, <10 testers); would be a Sev 1 at launch.
Suggested fix: Two options worth weighing —
  (a) **Branch convention + reviewer rule**: any PR touching `supabase/migrations/` requires the operator to have already prepared the prod push command. Document in the PR template. Cheap; relies on discipline.
  (b) **Automated post-merge hook**: a GitHub Action that runs `supabase db push` against prod when a PR landing on main contains a new migration file. Requires a Supabase service-role secret + careful handling of confirm-before-prod. More resilient; more setup.
  Until a decision is made, the operator should run `npx supabase link --project-ref <prod-ref> && npx supabase db push` immediately after merging any migration PR, then re-link to dev.
Status: OPEN (revisit before opening to >10 testers; the current pattern is acceptable while the operator is the only writer of the prod DB).

## 2026-04-27 — Independent reviews of PRs #86, #96, #97

Items deferred from three sub-agent reviews of the V.5a constellation-wiring + post-session-narrative + Call-2 PRs. Ship-blockers were addressed in the PRs themselves; the items below are accepted-defer with concrete next-action notes.

FINDING 1
Severity: LOW
Lens: correctness
Location: src/app/progress/page.tsx loadConstellation (constellation branch)
Root cause: `breakthroughs.in("session_id", sessionIds)` and `insights.in("session_id", sessionIds)` filter the constellation by the breakthrough/shift's *parent* session_id, not by created_at or by reachability through contributor arrays. With CONSTELLATION_SESSION_LIMIT=200, a user with >200 sessions will see breakthroughs whose parent session falls outside the recent window silently disappear, even when their `contributing_session_ids` include current sessions.
Blast radius: 200 sessions ≈ 4 years at weekly cadence — distant. No user is at risk today. Becomes user-visible only at very long-tenure usage.
Suggested fix: Change the breakthrough/insight scope from "parent session in recent N" to "created_at within window" once a real user gets within sight of the boundary. Drop CONSTELLATION_SESSION_LIMIT in favor of date-based filtering at that point.
Status: OPEN (revisit when the first user crosses 100 sessions).

FINDING 2
Severity: LOW
Lens: correctness
Location: src/app/progress/page.tsx breakthroughDetailFor / shiftDetailFor (constellation branch)
Root cause: The expanded-detail builders look up each contributor session in `sessionEndedById` and drop rows where the id misses. `sessionEndedById` is populated only from the recent-200 sessions plus the goal-last-session backfill — so a breakthrough whose `contributing_session_ids` reach back further than 200 sessions has its older contributors silently filtered out before the count is computed. The narrative renders "emerged from 3 sessions" when the model claimed 7.
Blast radius: Same long-tenure cliff as Finding 1; same near-term "doesn't matter" footnote. The undercount is subtle — looks like accurate data, isn't.
Suggested fix: Either (a) extend the existing extra-session backfill query (currently `goalLastSessionIds`-only at lines ~188–203) to also pull `ended_at` for any session id referenced in a breakthrough's or shift's `contributing_session_ids` outside the recent-200 window — ~10 extra lines; or (b) surface "(+N earlier)" in the narrative so the count stays honest even when older sessions aren't rendered.
Status: OPEN (small fix; bundle with Finding 1's revisit).

FINDING 3
Severity: MED
Lens: operator
Location: src/app/sessions/[id]/complete/WaitState.tsx
Root cause: `WaitState` polls `router.refresh()` every 3.5s with no cap and no timeout. If `runSessionEndAnalysis` throws after the End click and never writes `coach_narrative`, the user sits on the wait-state indefinitely with rotating prompts and zero signal that anything's wrong. PR #96 ships with the Skip-for-now link as the only escape hatch — fine for D-1 but operationally blind.
Blast radius: Today, near-zero — `runSessionEndAnalysis` errors are already captured to Sentry under `session_end_*` stages, so a failure surfaces there. But the *user* never finds out. At the >10-tester gate, "session feels stuck" with no diagnostics will cost trust.
Suggested fix: Two layers, both cheap. (1) After 90s (or some other "longer than usual" threshold), have `WaitState` call `Sentry.captureMessage('post_session_wait_state_extended', ...)` so we can see in production whether and how often this is happening. (2) After 180s, swap the wait-state for a soft-fallback CTA: "Your session is saved — analysis is taking longer than usual. Head home and we'll show the summary on the sessions list when it's ready." Pair with a future query that surfaces the pending narrative on `/sessions` once analysis completes.
Status: OPEN (revisit at >10-tester gate or when first Sentry event for `session_end_*` lands without a corresponding response submission).

FINDING 4
Severity: MED
Lens: operator
Location: src/app/sessions/actions.ts submitSessionResponse
Root cause: Call 2 (`runSessionResponseAnalysis`) is fired from the action via `after()` only. If the `after()` callback crashes after the redirect — Vercel kill, OOM, transient OpenAI 5xx — the row is left with `user_responded_at IS NOT NULL AND response_parsed_at IS NULL` indefinitely. There is no recovery path. Sentry will see the error stage but no automatic retry happens.
Blast radius: Per-failure: one user's disagreement signals are silently dropped — their reflection went into `user_response_text` but the analysis never ran, so any rejected shifts/breakthroughs stay marked as endorsed. At 1 op + <10 testers, near-zero. At launch, this is a recurring small data-loss bug.
Suggested fix: Add a cron sweep that picks up `WHERE user_responded_at IS NOT NULL AND response_parsed_at IS NULL AND user_responded_at < now() - interval '5 minutes'` and runs `runSessionResponseAnalysis`. Mirrors the abandonment-cron pattern already used for Call 1. The RPC's `response_parsed_at IS NULL` guard keeps it idempotent against the cron racing the action's `after()`.
Status: OPEN (queue alongside any Call-2 expansion or before opening to >10 testers).

FINDING 5
Severity: LOW
Lens: data-integrity
Location: reference/prompt-session-response-v1.md, supabase/migrations/20260427210000_process_session_response.sql
Root cause: The Call-2 schema separates `disagreed_shifts` and `disagreed_breakthroughs` into two arrays. If the model emits a breakthrough id under `disagreed_shifts` (or vice versa), the per-table `WHERE id = … AND session_id = …` guard in the RPC silently drops the entry — real but quiet data loss. The prompt now has an explicit "id routing is strict" note (PR #97), but enforcement is still trust-based; the RPC has no fallback.
Blast radius: Per-misroute: one disagreement signal dropped, no surface. With strict-mode JSON schema + the new prompt note, near-zero at the v1 prompt; risk grows if a future prompt-vN combines both lists or invites cross-references.
Suggested fix: Either (a) collapse the schema to a single `disagreed: [{ id, kind: 'shift'|'breakthrough', note }]` array and dispatch in the RPC by `kind`, removing the routing risk entirely; or (b) keep the split but add a fallback in the RPC: when an id from `disagreed_shifts` doesn't match an `insights` row, try `breakthroughs` before silently skipping. Option (a) is cleaner; option (b) is non-breaking. Bundle with the next prompt-session-response version bump (likely when score recalibration / goal-completion gets added in D-3).
Status: OPEN (revisit at D-3).

## 2026-04-27 — Process gap: stacked PRs swept by squash-merge (#96 + #97 superseded)

Note: Audit-trail anomaly only — no functional impact
Severity: LOW
Lens: operator
Location: PR #99 squash commit `c73e08f` on main; closed PRs #96 + #97
Root cause: PR #99 (fixture runner) was branched on top of PR #97 (Call 2 response-parser), which was branched on top of PR #96 (post-session narrative UI). When #99 was squash-merged first, GitHub's squash bundled the entire stacked lineage into a single commit on main. The intended changes from #96 and #97 — `NarrativeForm.tsx`, `WaitState.tsx`, `session-response.ts`, the `process_session_response` RPC migration, etc. — landed on main as part of `c73e08f`, not under their own PR numbers. #96 and #97 were closed-not-merged (the GitHub UI does not allow merging a PR whose contents are already on the target branch).
Blast radius: Zero functional impact — the code shipped, the migration is on dev, prod will get it on the next prod-push. The only cost is git-blame accuracy (lines authored in #96/#97 trace back to `c73e08f`'s squash) and PR-history readability (closed-not-merged PRs require a closing comment to explain).
Suggested fix: Already mitigated. Closing comments on #96 and #97 explain the supersedence; this entry adds an operator-level audit trail. Going forward: when stacking PRs, either (a) merge the bottom of the stack first, or (b) rebase upper branches onto main before squash-merging so the squash only contains its own changes.
Status: FIXED (2026-04-27) — process learning, no code action needed.


## 2026-04-29 — Style calibration aggregator: needs real-user testing

Severity: MED
Lens: product
Location: `src/lib/style-calibration.ts`, `reference/prompt-style-calibration-v1.md`, `coaching_state.recent_style_feedback`
Root cause: This is a brand-new feedback loop with several knobs picked on intuition, not data: the 10-session window (vs 5 / 20 / exponential decay), the float drift cap (~0.3 per update), the choice to feed the LLM the most recent transcript at all, and the dedicated 4th-developer-message strategy vs burying calibration in the profile. Two open questions are also testing-only:
  1. Does the LLM *actually* shift style based on the natural-language summary, or just nod at it? Only production dialogue tells you.
  2. Will users engage with the sliders enough to produce useful data, or will most submits be empty/Skip and the loop will starve?
Blast radius: At pre-launch / <10 testers: low — the worst case is calibration drifts in odd directions and we adjust the prompt or the aggregator math. At public-beta scale: a misaligned aggregator could push the coach toward unhelpful tones at scale.
Suggested fix: Bake real-user signal into the next round before locking the design:
  - Log per-session whether the calibration message was emitted vs skipped, and the pre/post float values.
  - At the >10-tester gate (or before public beta), spot-check a sample of pre/post calibration deltas against the qualitative session feedback to see if the aggregator's reading matches the operator's.
  - Be willing to: change the window size, drop the transcript input if it adds noise, or move the calibration back into the profile if the dedicated-message approach doesn't change outcomes.
Status: OPEN (revisit at >10-tester gate).

## 2026-04-30 — Audit (scope: 80191dd..9c33e4e, PRs #176 + #177 + #178; voice infra context PRs #169-174)

### Summary

10 findings total: 0 critical, 1 high, 4 med, 5 low.

The three merged PRs are individually small (per-coach TTS voice mapping, Speed Insights wiring, disclaimer-column revert + crisis-resources page) and the disclaimer revert + migration are clean — the IF EXISTS clause makes the DROP a no-op on fresh DBs, no orphan refs to `disclaimer_acknowledged_at` remain anywhere in the source, and the dropped column had no FKs / triggers / policies attached, so cascade impact is nil. The one HIGH finding is on the new TTS pipeline: `getOnboardingState()` is now called unguarded on every `/speak` request, and it throws on transient Supabase errors — a per-request DB hiccup will now break voice-mode TTS even though the coach's text reply could otherwise stream fine. Findings on the broader voice infra (PRs #169-174) that the user flagged for in-scope review surface a recurring theme: `/speak` and `/transcribe` have no rate limiting and `/speak` doesn't check `ended_at`, so an authenticated user can amplify cost against an old session indefinitely. The crisis-resources section on `/support` is content-correct but ergonomically weak — phone numbers aren't tel-linked, and the page is buried 2-3 navigations deep from any in-app surface where a distressed user might be.

### Findings

FINDING 1
Severity: HIGH
Lens: correctness
Location: src/app/api/sessions/[id]/speak/route.ts:65 (the new `getOnboardingState()` call added in PR #176)
Root cause: PR #176 added `const onboarding = await getOnboardingState();` to the /speak route to look up the user's coach and pick a matching voice. `getOnboardingState()` re-throws on any Supabase read error (see src/lib/onboarding.ts:53 — `if (error) throw error;`), and the speak route does not wrap the call in try/catch. Any transient Supabase hiccup (network blip, RLS quirk, JWKS cold cache, brief connection pool exhaustion) on the onboarding read will now bubble out of the route as an unhandled exception → 500. The pre-#176 code took no DB read for voice config and ran TTS directly.
Blast radius: Voice-mode users hit a hard 500 on /speak when the DB read for coach name fails, even though the chat stream itself (which already succeeded) gave them a coach reply. The user sees text but no audio, with no useful error message. The look-up is **purely cosmetic** — we only need it to pick which of 8 voices to use; the safe behavior is to fall back to the default voice, not to abort TTS entirely. At <10-tester scale this is rare; at any kind of scale it'll surface as "voice mode keeps cutting out for no reason."
Suggested fix: Wrap the lookup in try/catch and treat any failure (including throw) as `coachName = null`, which already triggers the default-voice fallback inside `synthesizeSpeech` / `ttsVoiceForCoach`:
```ts
let coachName: string | null = null;
try {
  const onboarding = await getOnboardingState();
  coachName = onboarding?.coach_name ?? null;
} catch (err) {
  // Cosmetic lookup; fall back to default voice on any DB hiccup.
  console.error("speak: coach lookup failed, using default voice", err);
}
```
Status: OPEN

FINDING 2
Severity: MED
Lens: security
Location: src/app/api/sessions/[id]/speak/route.ts (whole file — no `ended_at` guard) + src/app/api/sessions/[id]/transcribe/route.ts (has the guard) + src/app/api/sessions/[id]/messages/route.ts (has the guard)
Root cause: `/transcribe` and `/messages` reject requests against an ended session (`if (sessionRow.ended_at) return 409`). `/speak` only checks ownership — an authenticated user can keep POSTing to /speak for a session they ended weeks ago and burn TTS quota indefinitely. Combined with no rate limiting on any of the voice routes (Finding 3), a malicious or buggy client (e.g. a runaway loop in a pinned tab) can cost-amplify against an old session without writing anything to the DB.
Blast radius: Authenticated users only — RLS prevents cross-user access, so the worst case is a logged-in user attacking their own quota. At pre-launch scale, near-zero. At launch with self-signup open, this is the kind of cost-attack vector that picks one or two abusive accounts and burns the OpenAI bill. TTS at gpt-4o-mini-tts is cheap (~$0.015 per 500-char reply) but a tight loop hitting /speak with the 4000-char max could rack up real money fast.
Suggested fix: Mirror the /transcribe guard — read `ended_at` along with `id` and 409 if set. Keep the field in the existing query (one column, free).
Status: OPEN

FINDING 3
Severity: MED
Lens: security
Location: src/app/api/sessions/[id]/speak/route.ts, src/app/api/sessions/[id]/transcribe/route.ts, src/app/api/sessions/[id]/messages/route.ts
Root cause: None of the three coaching-loop endpoints have rate limiting. /speak in particular is the cheapest to call (just text → audio, no other DB writes) and the most expensive externally (TTS-per-character). Pre-#176 there was already cost-amplification risk on /messages (OpenAI chat tokens) and /transcribe (Whisper minutes); /speak adds another dimension. Per-IP / per-user / per-session caps exist nowhere in the codebase (search for "rate.?limit" returns one stray comment in messages/route.ts).
Blast radius: At <10-tester pre-launch scale: zero. At launch / public-beta: a single logged-in user can cost-amplify in any of three independent ways. There's no kill-switch short of revoking the OpenAI key.
Suggested fix: At the >10-tester gate or before opening public beta, wire a simple per-Clerk-user rate limit (Vercel KV + token bucket, or Upstash Ratelimit) at the top of all three routes. The existing 2026-04-22 Audit FINDING 22 already calls out the same gap on /healthcheck — bundle this work together. A reasonable starter: 30 messages, 60 transcribes, 60 speaks per minute per user.
Status: OPEN

FINDING 4
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260501120000_drop_disclaimer_acknowledged.sql + supabase migration repair history (described in the PR #178 commit message)
Root cause: PR #175 (the disclaimer-gate experiment) was closed without merging, but its migration `20260430120000_disclaimer_acknowledged_at.sql` had been applied to both innerverse-dev and innerverse-prod out-of-band before the close. The recovery procedure described in the PR #178 commit message is `supabase migration repair --status reverted 20260430120000` followed by `db push` of the new DROP migration. This is correct in principle, BUT (a) we have no in-repo evidence that the repair was actually run against both projects, (b) the repair mutates `supabase_migrations.schema_migrations` in a way that's invisible from the source tree, and (c) any drift between dev and prod here would only surface at the next migration that reads the migration history (e.g. a dependency on the prior schema state). The verification trail is in the commit message only.
Blast radius: If the repair was missed on one project, the migration history table still says `20260430120000` is "applied" there. A future tooling run (`supabase db diff`, `db pull`, generated types) could try to recreate the column or get confused about schema state. At pre-launch this is recoverable. After real users land, it's harder.
Suggested fix: Operator action — verify in both Supabase dashboards (dev + prod) that `supabase_migrations.schema_migrations` no longer contains a row with version `20260430120000` (or has it as `reverted` if the repair tool keeps it for audit). Document the result in this finding before closing. Going forward: any out-of-band migration apply-then-revert should leave a brief in-repo note (e.g. comment in the new migration) recording which projects were touched and which `migration repair` commands were run, so the next operator can verify without paging the original author.
Status: OPEN

FINDING 5
Severity: MED
Lens: correctness
Location: src/app/support/page.tsx:36-60 (crisis-resources section)
Root cause: Phone numbers (988, 116 123, 112) are rendered as plain `<span>` text, not `<a href="tel:…">` links. On mobile — the most likely device for a user in crisis — the user has to read the number, switch apps, and dial manually. Friction at the worst possible moment. The "your local emergency services" line has no actionable target either (no link to a country-list or to `tel:911` etc.). The "in immediate danger" first sentence is correct but the action that follows is an unclickable wall of text on a mobile keyboard.
Blast radius: Probability is low (suicidality + having InnerVerse open + actually navigating to /support is a narrow funnel) but the failure mode is severe. This is the one place in the app where ergonomics genuinely matter for safety, not just polish.
Suggested fix: Wrap each phone number in `<a href="tel:988">988</a>` (and similar for 116 123 → `tel:+44116123` and 112 → `tel:112`). On Android/iOS this triggers the dialer directly. Bonus: link the underlying section heading too, so screen readers announce "in a crisis" before reading the numbers, and consider adding the numbers in international-callable form (`tel:+1988`) so the link works for users abroad on their home country's dialer.
Status: OPEN

FINDING 6
Severity: MED
Lens: architecture
Location: src/app/support/page.tsx (the entire page) + the lack of any in-app deep link from sessions / home / progress to the crisis section
Root cause: PR #178's commit message frames the crisis content on /support as the replacement for the closed PR #175's disclaimer gate, which surfaced crisis numbers at signup. But the only in-app link to /support is buried in /settings (Settings → Support → scroll past 4 other sections → find "In a crisis"). A user mid-session who needs the number has to: end session → home → settings tab → support → scroll. That is materially less reachable than the original gate, and less reachable than the equivalent surface in many other AI products (Replika, Character.AI, etc., all have crisis info one tap away from chat).
Blast radius: Same low-probability/severe-failure-mode as Finding 5. The two compound — even if the user gets to /support, Finding 5 means the dial is still a manual step.
Suggested fix: Two cheap moves before the >10-tester gate. (a) Add a small "In a crisis?" footer link inside `ChatView`'s header or footer area, deep-linked to `/support#crisis` (and add `id="crisis"` to the section). (b) Confirm with the operator whether the design intent is "/support is sufficient" or whether the disclaimer gate's signup-time surfacing should come back in some lighter form (e.g. a one-time post-onboarding note rather than a blocking gate). Either decision is fine; the current state is "the gate was removed and what replaced it is harder to reach than the gate was."
Status: OPEN

FINDING 7
Severity: LOW
Lens: security
Location: src/lib/openai.ts:53-69 (COACH_VOICE_MAP / COACH_SPEED_MAP lookup using `Record<string, string>` and bracket access)
Root cause: `ttsVoiceForCoach(coachName)` does `COACH_VOICE_MAP[coachName.toLowerCase()] ?? DEFAULT_TTS_VOICE`. The lookup goes through Object.prototype, so `coachName === "constructor"` returns the `Object` constructor function, `coachName === "__proto__"` returns Object.prototype, and similar for `toString`, `hasOwnProperty`, etc. The `?? DEFAULT_TTS_VOICE` fallback only kicks in for null/undefined, not for these inherited values, so the eventual `voice: <function>` would be passed to OpenAI. The OpenAI SDK would presumably reject it with a 4xx (since `voice` must be one of a known string set), which would propagate back as a 500 from /speak. Today coach_name is validated against `COACH_VALUES` in saveStep5 (src/app/onboarding/actions.ts), so this is theoretical — but defense-in-depth prefers a lookup that can't be tricked by prototype keys at all.
Blast radius: Currently zero (input validation closes the path). If a future migration / data import / direct-DB-write ever sets coach_name to a prototype name, /speak fails for that user with a 500. Not a security boundary failure, just a fragility footgun.
Suggested fix: Either (a) use a `Map<string, string>` instead of `Record<string, string>` — `Map.get()` doesn't traverse the prototype chain — or (b) explicit check: `Object.prototype.hasOwnProperty.call(COACH_VOICE_MAP, key) ? COACH_VOICE_MAP[key] : DEFAULT_TTS_VOICE`. Map is cleaner.
Status: OPEN

FINDING 8
Severity: LOW
Lens: architecture
Location: src/app/api/sessions/[id]/speak/route.ts (one extra DB read per /speak call)
Root cause: The new coach-name lookup is a separate Supabase round-trip per /speak call. /speak is called once per "speakable chunk" of a streaming chat response — VoiceComposer chunks responses on sentence boundaries with min 30 / max 150 chars (ChatView.tsx:173). A typical 500-char coach reply is 4-8 chunks, so a single coaching turn now does 4-8 onboarding-table SELECTs to look up a value that doesn't change within a session. The PR #176 commit acknowledges this ("One extra DB read per /speak call — acceptable since /speak is already authenticated + session-checked, and TTS itself dwarfs the cost") but doesn't note the per-chunk multiplier.
Blast radius: Latency only, not correctness. At pre-launch scale it's invisible; at scale it's wasted Supabase round-trips. No data corruption / RLS bypass / cost amplification beyond the already-noted Findings 2-3.
Suggested fix: Pass `coachName` from the page-level coach lookup down through ChatView → VoiceComposer → /speak call, so the client sends `{ text, coachName }` and the server trusts the (already-validated) coach name without re-reading. Or: cache the lookup at the action boundary using React's `cache()` once per request — would also help the standing 2026-04-26 redundant-auth() finding. Defer until rate-limiting work bundles all the per-request optimizations.
Status: OPEN (defer; bundle with the rate-limit / auth-cache work)

FINDING 9
Severity: LOW
Lens: security / privacy
Location: src/app/layout.tsx:29 (`<SpeedInsights />` mounted root-wide)
Root cause: Vercel Speed Insights is mounted at the root layout with no `beforeSend` hook and no sample-rate config. The library's `useRoute()` parameterizes dynamic segments correctly (so `/sessions/[id]` is recorded as `/sessions/[id]`, not `/sessions/abc123`) — verified by reading node_modules/@vercel/speed-insights/dist/next/index.mjs:39-66. **Path-level data is fine.** What it does still send: User-Agent (browser fingerprint), IP-derived geolocation, route, vitals (LCP, INP, CLS, FCP, TTFB) per page-load. Per Vercel's data-handling docs that's the standard set. No request bodies, no chat content, no Clerk session token. So nothing in the codebase leaks via Speed Insights, but the operator should be aware that signed-in user IPs + geo + browser are now in Vercel's telemetry warehouse alongside Vercel Analytics.
Blast radius: Negligible. The same data is already implicit in any Vercel deployment's request logs. No additional GDPR exposure that wasn't there before. Worth flagging only as a checklist item for the privacy-policy update at the >10-tester gate (the privacy policy may want to mention Vercel as a sub-processor for Speed Insights specifically, in addition to the existing Vercel hosting mention).
Suggested fix: At the >10-tester gate, (a) confirm with the operator whether to add `<SpeedInsights sampleRate={0.5} />` to halve telemetry volume (Vercel charges per event past free-tier; cheap insurance), (b) update the Privacy Policy text to mention Vercel Speed Insights as a sub-processor for performance telemetry, listing the data collected. No code change needed pre-launch.
Status: OPEN (revisit at >10-tester gate)

FINDING 10
Severity: LOW
Lens: operator
Location: supabase/migrations/20260501120000_drop_disclaimer_acknowledged.sql (filename) vs the column it drops (`disclaimer_acknowledged_at`)
Root cause: The DROP migration's filename is `drop_disclaimer_acknowledged.sql` but the column it drops is `disclaimer_acknowledged_at`. The original ADD migration's filename was `disclaimer_acknowledged_at.sql` (matching the column name exactly). The DROP migration's body is correct (`drop column if exists disclaimer_acknowledged_at`), so functionally this is fine — Supabase keys on the timestamp prefix, not the descriptive suffix — but the filename inconsistency makes a future grep for "disclaimer_acknowledged_at" miss the drop migration if anyone is searching for it by column name.
Blast radius: None operationally. Cosmetic — affects the next operator's ability to find the migration via filename search.
Suggested fix: None at this point — renaming a migration file after it's applied creates more confusion than it solves. Going forward, name DROP migrations to match the dropped column exactly: `20260501120000_drop_disclaimer_acknowledged_at.sql`. Convention only; no code change.
Status: WON'T FIX (cosmetic; conventions noted for next time)

### Per-lens silence check

- **Security**: 4 findings (2-3 + 7 + 9). The audit-prompt-template's blind-spot checklist items 7 (trust-boundary input handling) and 12 (secrets in code/logs) ran clean — voice content gets passed verbatim to Whisper/TTS but never logged at info level, no API keys are exposed, the Clerk-Supabase JWT bridge is unchanged from prior audits.
- **Data integrity**: 1 finding (4). Migration repair-trail verification gap. Items 5 (data-loss patterns) and 6 (silent failures) ran clean for this scope — no new multi-table writes, no new Promise.all paths.
- **Correctness**: 2 findings (1 + 5). Finding 1 (the unguarded throw) is the highest-severity item and the one that most needs operator triage. Finding 5 is the crisis-resources ergonomics issue.
- **Architecture**: 3 findings (6 + 8 + 9). All defer-able to milestone gates.
- **Blind-spot checklist item 11 (cross-component / cross-runtime consistency)**: The COACH_VOICE_MAP map is enforced TypeScript-side via `Record<string, string>`. Direct Supabase admin writes could bypass the saveStep5 validation — Finding 7 covers the one runtime hazard from that path.
- **Blind-spot checklist item 13 (failure-mode behavior)**: Finding 1 IS this — the failure path of the cosmetic onboarding lookup currently fails OPEN-but-broken (the route 500s rather than degrading to default voice). Should fail-graceful (default voice) since the lookup is non-essential.

