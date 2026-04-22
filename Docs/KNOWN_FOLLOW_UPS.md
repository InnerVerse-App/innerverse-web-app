# InnerVerse — Known follow-ups

Ledger of audit findings, deferred decisions, and accepted tech debt.
Append-only — never delete past entries. Status transitions (OPEN →
IN PROGRESS → FIXED → WON'T FIX) are recorded in-place by editing the
`Status:` line, not by removing the entry.

## How this file is used

- **Fresh-session audits** (see `review-cadence/audit-prompt-template.md`)
  append a dated section with numbered findings from the four review
  agents.
- **Operator-initiated items** (decisions to defer, limitations we
  know about, items surfaced outside a formal audit) can be added as
  their own dated section.
- **Resolved items** stay in the ledger with `Status: FIXED (<date>,
  <commit-SHA>)` so the trail is auditable. Don't purge.

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

## 2026-04-22 — Audit (scope: main..claude/phase-4-identity-tables)

### Summary

24 findings total: 1 CRITICAL, 8 HIGH, 11 MED, 4 LOW.

Branch under review ships three coordinated chunks (Supabase CLI scaffold, Clerk → Supabase JWT bridge `supabaseForUser()`, identity-tables migration with RLS) plus prior Phase 3 PWA / sign-in scaffolding. Themes:

1. **The whole RLS story is conditional on a Clerk → Supabase third-party-auth integration that is set up in the Supabase dashboard, not in code.** `supabase/config.toml` ships with `[auth.third_party.clerk] enabled = false` and no `domain`. Local-dev RLS will silently no-op, and a hosted prod project that hasn't had the dashboard step done will silently grant nothing (fail-closed) or — if mis-set — fail in surprising ways. There is no integration test that proves Clerk → Supabase RLS scopes rows correctly end-to-end. **Run that test before any onboarding code lands.**
2. **The `set_updated_at()` trigger function is missing `SET search_path = public`** (the one CRITICAL finding). This is a real Postgres anti-pattern that lets a future malicious or accidental schema-on-the-search_path hijack the trigger.
3. **Signup race: no row in `public.users` is created at sign-in time.** User-row creation is deferred to a Clerk webhook (chunk 4.2b, not yet built). Until that webhook lands and is verified, any code path that calls `supabaseForUser()` will operate against an empty users table and any future onboarding INSERT will fail with FK violation.
4. **`src/lib/supabase.ts` exports both `supabaseAdmin()` (service-role, RLS-bypass) and `supabaseForUser()` (user-scoped) with no `'server-only'` import guard.** A future client-component import would either bundle the service-role key (security disaster) or fail opaquely. JSDoc warnings are not enforcement.
5. **Healthcheck endpoint** has three small issues that compound: `String(err)` echoed in JSON response (info leak risk), no `fetch` timeout (DoS / slot exhaustion), and the route is in the Clerk middleware matcher (Clerk outage masquerades as Supabase outage).
6. **Email column has no UNIQUE constraint.** Clerk enforces uniqueness at auth, but if Supabase is the source of truth for app reads and Clerk drift is possible, the app's "one row per email" assumption is unenforced.
7. **Migration is not idempotent** — `CREATE TABLE` and `CREATE TRIGGER` lack `IF NOT EXISTS`. Re-application would halt mid-migration.

**Most urgent for the operator today:**
- Verify the Clerk → Supabase third-party-auth dashboard setup is actually complete for `innerverse-dev` AND `innerverse-prod`, AND that Clerk's standard session token populates the `sub` claim with the Clerk user ID. This is the single biggest unverified assumption underlying every RLS policy in the migration. (FINDINGS 1, 7)
- Add `SET search_path = public` to the trigger function and re-issue the migration before applying anywhere. (FINDING 2)
- Sanitize `String(err)` from the healthcheck response. (FINDING 13)
- Do not write any code that calls `supabaseForUser()` until the Clerk webhook (4.2b) lands and is verified to create the users row before the user can reach the app. (FINDING 5)

**Note on ledger location:** This audit was written into the `main`-branch copy of the ledger (working-tree on `main` at audit time). The `claude/phase-4-identity-tables` branch contains additional ledger entries from Phase 3 / 4.1 work that have not yet been merged to `main`. When the branch lands, this section needs to be reconciled with the branch's existing entries (or this audit re-appended after merge).

### Findings

```
FINDING 1
Severity: HIGH
Lens: security
Location: supabase/config.toml:352-356, src/lib/supabase.ts:43-54
Root cause: `[auth.third_party.clerk]` is disabled in `config.toml` (no `domain` set), but `supabaseForUser()` and the migration's RLS policies (`auth.jwt()->>'sub'`) assume the Clerk JWKS integration is live in the hosted Supabase project. The hosted-dashboard setup is invisible from the repo.
Blast radius: If the hosted project's Clerk integration is misconfigured, every `supabaseForUser()` query will either return zero rows silently (RLS USING-clauses evaluate to false because `auth.jwt()->>'sub'` is null) or — worse, if the dashboard accepts a permissive secret — RLS could be bypassed. Operator can't tell from the repo alone which state the hosted project is in.
Suggested fix: (a) Enable `[auth.third_party.clerk]` in `config.toml` and document the JWKS domain in `supabase/README.md`. (b) Add a one-time end-to-end smoke test: create a Clerk session in dev, decode the token, assert `sub` equals the Clerk user ID, then INSERT a row via service-role and confirm the same user can SELECT it via `supabaseForUser()` while a different user cannot.
Status: OPEN
```

```
FINDING 2
Severity: CRITICAL
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql:24-32 (set_updated_at function)
Root cause: `public.set_updated_at()` is `LANGUAGE plpgsql` with no `SET search_path` clause. PostgreSQL resolves unqualified references using the caller's search_path at trigger time, not the function's defining schema.
Blast radius: A schema added to the search_path with a hostile or buggy function of the same name (or any unqualified reference inside the function body, were it to grow) could be hijacked. Industry standard is to always pin search_path on `SECURITY DEFINER` and on triggers that touch user data. Today's body is trivial and uses no unqualified references except `now()`, but the precedent is set.
Suggested fix: Re-issue the migration with `SET search_path = pg_catalog, public` between `language plpgsql` and `as $$`. (Or, if the migration has not yet been applied to any DB, edit the file in place rather than adding a follow-up migration.)
Status: FIXED (2026-04-22, PR #17) — function definition now includes `SET search_path = pg_catalog, public`.
```

```
FINDING 3
Severity: HIGH
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql:38-44 (users.email)
Root cause: `email` column is not `UNIQUE`. Clerk enforces unique email at the auth layer but Supabase does not enforce it for the `public.users` mirror.
Blast radius: If Clerk → Supabase sync ever drifts (webhook bug, manual SQL, race), two `users` rows could carry the same email. App code that does `select * from users where email = ?` would return ambiguous results. RLS hides cross-user rows during normal queries, so the drift would be invisible until a service-role report or admin query surfaces it.
Suggested fix: Add `unique` to the email column. Decide whether `null` should be allowed (multiple nulls are fine under SQL `UNIQUE` semantics).
Status: FIXED (2026-04-22, PR #17) — `email` column now has UNIQUE constraint.
```

```
FINDING 4
Severity: HIGH
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql:96-130 (no DELETE policy on users)
Root cause: No `DELETE` policy exists for `authenticated` on `public.users`. Comment says deletion goes through service-role via the planned 4.2b webhook. Until that webhook lands and is verified, a user has no in-app way to delete their own account.
Blast radius: GDPR / "right to be forgotten" is unsatisfiable until the deletion webhook lands. Soft-block on accepting any user beyond the operator until the webhook ships AND is verified end-to-end.
Suggested fix: (a) Land 4.2b before any non-operator user creates an account. (b) Until then, document explicitly that account-deletion-on-request is a manual SQL operation. (c) Optionally add a `users_delete_own` policy as a fallback so users can self-serve even if the webhook is slow.
Status: OPEN
```

```
FINDING 5
Severity: HIGH
Lens: data-integrity
Location: src/lib/supabase.ts:43-54 + supabase/migrations/20260422062124_identity_tables.sql (no users-row creation in scope)
Root cause: A signed-in Clerk user can call `supabaseForUser()` immediately after sign-in, but no `users` row exists for them until the Clerk `user.created` webhook (chunk 4.2b, not yet built) fires and writes via service-role. Any subsequent INSERT into `onboarding_selections` will fail with a FK violation because `user_id REFERENCES users(id)`.
Blast radius: First-time onboarding will break unless the webhook is fast and reliable. If the webhook is dropped (Clerk delivery failure, Vercel cold-start race, Supabase 500), the user is stuck — they have a Clerk session but cannot complete onboarding because their parent row never appears.
Suggested fix: Before any onboarding code ships: (a) Build and verify the Clerk webhook end-to-end. (b) Add explicit FK-violation handling in onboarding INSERTs (retry-with-backoff, bounded). (c) Consider an upsert-the-users-row-on-first-API-call fallback (server-side, via service-role, idempotent on PK) so the app self-heals if the webhook is slow.
Status: OPEN
```

```
FINDING 6
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql:56-65 (onboarding_selections cascade)
Root cause: `onboarding_selections.user_id` uses `ON DELETE CASCADE`. That's correct for this table, but it sets a precedent: every future user-owned table must consciously decide CASCADE vs RESTRICT vs SET NULL, and there is no mechanism (lint, convention doc) to enforce that decision.
Blast radius: Future tables that forget to specify cascade will silently default to `NO ACTION`, leaving orphaned rows after a user deletion via service-role. Cross-table joins after a deletion will return inconsistent results.
Suggested fix: Add a one-line convention to `supabase/README.md`: "Every user-owned table MUST specify `ON DELETE CASCADE` (or document why not) on its FK to `users.id`." Re-audit at every milestone gate.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` Conventions section now states the rule. Lint/automation enforcement still open.
```

```
FINDING 7
Severity: HIGH
Lens: security
Location: src/lib/supabase.ts:46-48 (assumes Clerk session token includes 'sub' = Clerk user ID)
Root cause: `supabaseForUser()` calls `getToken()` (no JWT template name passed) and forwards the result as a Bearer token. RLS policies key off `auth.jwt()->>'sub'`. If Clerk's standard session token does NOT populate `sub` with the Clerk user ID (or populates it with a different value, e.g. session ID), every RLS check fails silently and `supabaseForUser()` returns zero rows for everything.
Blast radius: Silent zero-rows for every RLS-scoped query. App appears "broken but not insecure." Hard to debug because the error is empty result sets, not auth failures.
Suggested fix: Decode `getToken()`'s output once in dev and assert `sub` is the Clerk user ID. If not, configure a Clerk JWT template explicitly and pass its name to `getToken({ template: '...' })`. Document the answer in `src/lib/supabase.ts` JSDoc.
Status: OPEN
```

```
FINDING 8
Severity: HIGH
Lens: security
Location: supabase/migrations/20260422062124_identity_tables.sql:106-110 (users_insert_own policy)
Root cause: Authenticated users can insert their own `users` row via the app (policy `id = auth.jwt()->>'sub'`). Combined with the absence of UNIQUE on `email` (FINDING 3), an attacker with a valid Clerk session can create a row with arbitrary `display_name` and `email` strings before the Clerk webhook fires.
Blast radius: Identity-pollution / impersonation. If `display_name` or `email` is later trusted for any user-facing display or email-based recovery, an attacker can preemptively claim them.
Suggested fix: Restrict user-row creation to service-role only (drop `users_insert_own` and rely entirely on the Clerk webhook in 4.2b). Add UNIQUE on email (FINDING 3). If a self-INSERT path is required for some reason, add a `CHECK` that constrains `display_name` and `email` to expected shapes.
Status: FIXED (2026-04-22, PR #17) — `users_insert_own` policy removed; INSERT into `users` is now service_role only via the (still-pending 4.2b) Clerk webhook.
```

```
FINDING 9
Severity: MED
Lens: architecture
Location: src/lib/supabase.ts (entire file — no 'server-only' guard)
Root cause: Both `supabaseAdmin()` (service-role) and `supabaseForUser()` (calls `auth()` from `@clerk/nextjs/server`) live in one module exported with no `import 'server-only'` line. JSDoc warnings exist; build-time enforcement does not.
Blast radius: Future client-component import of either symbol would either bundle `SUPABASE_SERVICE_ROLE_KEY` into the browser (CRITICAL secret leak) or fail opaquely with Clerk's "called from client" error. The operator is not in a position to catch this in line-by-line review.
Suggested fix: Add `import 'server-only';` as the first line of `src/lib/supabase.ts`. Build will fail loudly if a client component tries to import.
Status: FIXED (2026-04-22, PR #17) — `import 'server-only'` added at the top of `src/lib/supabase.ts`.
```

```
FINDING 10
Severity: MED
Lens: architecture
Location: src/middleware.ts (matcher includes /api/healthcheck)
Root cause: Clerk middleware matcher `"/(api|trpc)(.*)"` covers `/api/healthcheck`. The healthcheck does not need Clerk, and routing it through Clerk creates a hidden dependency: a Clerk outage makes the healthcheck fail even though Supabase is fine.
Blast radius: Healthcheck signals "down" when only Clerk is down. Confusing during incident response. Adds latency to every healthcheck.
Suggested fix: Exclude `/api/healthcheck` from the Clerk middleware matcher (extend the negation regex), or use `clerkMiddleware()` callback to short-circuit on the healthcheck path.
Status: FIXED (2026-04-22, PR #17) — `src/middleware.ts` matcher now excludes `/api/healthcheck`.
```

```
FINDING 11
Severity: MED
Lens: correctness
Location: supabase/migrations/20260422062124_identity_tables.sql (all CREATE statements)
Root cause: `CREATE TABLE`, `CREATE TRIGGER`, `CREATE POLICY` are not `IF NOT EXISTS`. A re-application (manual rerun, CI quirk, partial failure recovery) halts mid-migration. The commented DOWN block is also not `IF EXISTS` — rollback from a partial state can also fail.
Blast radius: Operator-time only. A re-run produces a confusing error and the database is left half-migrated until manual intervention.
Suggested fix: Add `IF NOT EXISTS` to `CREATE TABLE` and `CREATE TRIGGER`. Use `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` for each policy (Postgres lacks `CREATE POLICY IF NOT EXISTS`). Add `IF EXISTS` to the commented DOWN block.
Status: FIXED (2026-04-22, PR #17) — all CREATE / DROP statements now use IF NOT EXISTS / IF EXISTS, including the DOWN block.
```

```
FINDING 12
Severity: MED
Lens: correctness
Location: supabase/migrations/20260422062124_identity_tables.sql:24-32 (set_updated_at body)
Root cause: Trigger fires on every UPDATE — including no-op updates where the row didn't actually change. `updated_at` advances even when nothing meaningful happened.
Blast radius: Future "what changed since X" queries will over-report. Sync-to-external-system logic that filters by `updated_at > last_sync` will do unnecessary work. No correctness break, just semantic drift.
Suggested fix: Wrap in `if new is distinct from old then new.updated_at := now(); end if;` inside the trigger body.
Status: FIXED (2026-04-22, PR #17) — trigger body now wraps the assignment in `if new is distinct from old`.
```

```
FINDING 13
Severity: MED
Lens: security
Location: src/app/api/healthcheck/route.ts:11, 30 (`error: String(err)` in JSON response)
Root cause: Caught errors are serialized via `String(err)` and returned in the JSON response body. For Error instances this becomes `Error: <message>`; for other shapes it can include arbitrary internal state. The current code paths don't surface the service-role key directly, but any future error type that does (a fetch error that includes request headers, a Supabase SDK error that echoes config) would leak.
Blast radius: Information disclosure. Worst-case (low-probability) leak of service-role key or env state to any unauthenticated caller.
Suggested fix: Return a generic message in the response (`error: "service unavailable"`), `console.error` the full err server-side. Ship Sentry wiring (already on the roadmap) so server-side errors are captured.
Status: FIXED (2026-04-22, PR #17) — healthcheck no longer echoes `String(err)` in the response; full errors now go to `console.error`.
```

```
FINDING 14
Severity: MED
Lens: security
Location: src/app/api/healthcheck/route.ts:20-22 (fetch with no timeout)
Root cause: `fetch(`${url}/rest/v1/`, ...)` has no AbortSignal. A hung Supabase or network partition will tie up the serverless function until Vercel's platform timeout.
Blast radius: Slow-loris / DoS via repeated calls. Healthcheck consumers (uptime monitors) might also retry against a hung function, amplifying the issue.
Suggested fix: Pass `signal: AbortSignal.timeout(3000)` (Node 18+) and handle `AbortError` as a 503.
Status: FIXED (2026-04-22, PR #17) — Supabase fetch now uses `AbortSignal.timeout(3000)`.
```

```
FINDING 15
Severity: MED
Lens: data-integrity
Location: src/lib/supabase.ts:43-54 (supabaseForUser silent failure modes)
Root cause: Returns `null` on no Clerk session with no logging, no Sentry signal, no marker that distinguishes "user not signed in" from "Clerk SDK threw and caller swallowed". `auth()` throwing also propagates without context.
Blast radius: Subtle bugs once consumers exist. A caller that forgets to null-check gets a `TypeError` on `.from(...)`. A caller that catches and proceeds may degrade silently to anon (RLS still denies, so this is recoverable, but invisible).
Suggested fix: Add explicit logging at the null-return path (`console.warn('supabaseForUser called with no Clerk session')`). Once Sentry is wired, capture there. Document in JSDoc that callers MUST null-check.
Status: FIXED (2026-04-22, PR #17) — `console.warn` added on the no-token return path.
```

```
FINDING 16
Severity: MED
Lens: correctness
Location: src/lib/supabase.ts:46 (`const { getToken } = await auth();`)
Root cause: Destructures `getToken` from `await auth()` with no shape guard. If a future Clerk SDK version returns a different shape (e.g., `null`/`undefined`/missing `getToken`), the next line throws an unhelpful `TypeError`.
Blast radius: SDK upgrade breaks the whole user-scoped Supabase path with a cryptic error. Low probability today, real once Clerk SDK has an unrelated upgrade.
Suggested fix: `const session = await auth(); if (!session?.getToken) return null;` then call `await session.getToken()`.
Status: FIXED (2026-04-22, PR #17) — added `if (typeof session?.getToken !== 'function') return null;` guard before destructuring.
```

```
FINDING 17
Severity: MED
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql (table-level RLS-grants combined model)
Root cause: `authenticated` is granted `select, insert, update, delete` on both tables; RLS is the ONLY isolation enforcement. If `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` is ever run (ad-hoc maintenance, dashboard click), every authenticated user gets full access to every row.
Blast radius: Single-misclick → cross-user data exposure. No defense-in-depth.
Suggested fix: (a) Add `alter table ... force row level security;` so even table-owners can't bypass RLS without explicitly turning off `force`. (b) Document in `supabase/README.md` that RLS must never be disabled on user-owned tables.
Status: FIXED (2026-04-22, PR #17) — both tables now `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.
```

```
FINDING 18
Severity: MED
Lens: architecture
Location: supabase/migrations/20260422062124_identity_tables.sql + supabase/README.md
Root cause: Migration is committed but no in-repo evidence that it has been smoke-tested against `innerverse-dev` with a real Clerk token. RLS policies key off an integration (third-party-auth) whose state is invisible from the repo. First "did this actually work" signal arrives at apply time, not review time.
Blast radius: Subtle policy bugs (wrong claim name, JWT not validated, wrong role) surface on first real query. On Free-tier prod, with no PITR, a bad apply is hard to recover from.
Suggested fix: Add a "Pre-apply checklist" to `supabase/README.md`: (1) apply migration to dev; (2) sign in via Clerk in a temporary script; (3) verify a same-user SELECT returns rows and a cross-user SELECT does not. Block merging the chunk that consumes the schema until this is documented as done.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` Pre-apply checklist now exists. The actual smoke-test (sign in, decode JWT, verify same-user vs cross-user SELECT) is the operator's task before applying to dev.
```

```
FINDING 19
Severity: LOW
Lens: correctness
Location: src/lib/supabase.ts:32 (`Promise<SupabaseClient | null>`)
Root cause: Return type forces null-check at every call site, but TypeScript can't enforce that the check happens.
Blast radius: Easy-to-miss footgun. Once consumers exist, every site needs the check.
Suggested fix: Either add a sibling `supabaseForUserOrThrow()` for sites that require auth, or document the null contract prominently.
Status: OPEN
```

```
FINDING 20
Severity: LOW
Lens: correctness
Location: src/app/api/healthcheck/route.ts:16-17 (non-null assertions on env)
Root cause: After `supabaseAdmin()` is invoked just to validate env, `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.SUPABASE_SERVICE_ROLE_KEY!` are read directly. If one env var is missing the other, the assertion lies.
Blast radius: Tiny. Already tracked at a different layer in this ledger (2026-04-22 /simplify of PR #15). Calling this out here for completeness.
Suggested fix: Refactor per existing /simplify FINDING 1 (extract `getSupabaseAdminEnv()` or use the supabase-js client for the probe).
Status: OPEN (DUPLICATE of 2026-04-22 /simplify finding)
```

```
FINDING 21
Severity: LOW
Lens: data-integrity
Location: supabase/migrations/20260422062124_identity_tables.sql (shared trigger function across two tables)
Root cause: `set_updated_at()` is shared by both tables. Future change to the function affects all consumers atomically.
Blast radius: Coupling — if behavior needs to diverge per table, refactoring requires touching every consumer. Not a bug today.
Suggested fix: None today. Note in `supabase/README.md` that the trigger function is shared; modifying it changes behavior for every table that uses it.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` Conventions section notes the shared trigger function.
```

```
FINDING 22
Severity: LOW
Lens: security
Location: src/app/api/healthcheck/route.ts (no rate limiting)
Root cause: Healthcheck is unauthenticated and uncapped. An attacker can exhaust serverless concurrency by hammering it.
Blast radius: Low-impact DoS / cost amplification on Vercel.
Suggested fix: Once Vercel Edge Config or upstream rate-limit is wired, add a tight per-IP cap (e.g., 10 req/sec). Until then, accept the risk — healthcheck is needed.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` Conventions section now states 'RLS on user-owned tables is never disabled' (paired with FORCE RLS in F17). Per-IP rate limiting on the healthcheck endpoint itself remains OPEN.
```

```
FINDING 23
Severity: HIGH
Lens: data-integrity
Location: src/lib/supabase.ts:46-54 (token snapshot for long-running operations)
Root cause: Token is fetched once at client-creation time; the resulting Supabase client uses that token for every subsequent query. Clerk session tokens are short-lived (minutes). A long-running server action (slow OpenAI call, large insert) could exceed the token TTL and have its tail queries rejected.
Blast radius: Sporadic mid-operation auth failures on long-running paths (will matter most for session-end processing in Phase 6+). Today, with no long-running consumers, this is latent.
Suggested fix: For long operations, re-create the client between phases, or pass a fresh token at each query. Document the expected operation time per consumer. Revisit when session-end code lands.
Status: OPEN
```

```
FINDING 24
Severity: LOW
Lens: architecture
Location: supabase/config.toml + supabase/README.md (no documentation of dashboard-side setup)
Root cause: Hosted Supabase project setup (Clerk third-party auth, JWKS domain, role config) lives in the dashboard, not in the repo. A future contributor (or future-Steven setting up a new env) has no checklist.
Blast radius: Re-creating the prod environment from scratch requires tribal knowledge. Drift between dev and prod can develop unnoticed.
Suggested fix: Add a "Hosted-project setup" section to `supabase/README.md` listing every dashboard-side step (Clerk integration enable, JWKS domain, any auth provider config), with a screenshot or link per step.
Status: PARTIAL FIX (2026-04-22, PR #17) — `supabase/README.md` now has a 'Hosted-project setup' section listing the dashboard-side steps. Future-state ideal would be a CLI verification script; deferred.
```

### Per-lens notes

- **Security agent** ran the full 13-item checklist; flagged 6 findings (1 originally CRIT for unverified Clerk JWT integration, 1 CRIT for healthcheck error leak, 2 HIGH, 1 MED, 1 LOW). Severities downgraded above where the agent's blast-radius assumed a specific failure mode that is conditional on un-tested integration state.
- **Data-integrity agent** ran the full checklist; flagged 10 findings. Strongest signal was the `set_updated_at` `search_path` issue (kept CRITICAL — this is a real Postgres anti-pattern, not conditional on anything else).
- **Correctness agent** ran the full checklist; flagged 8 findings, mostly small (timeout, idempotency, error-stringification, shape guards).
- **Architecture agent** ran the full checklist; flagged 5 findings around the server-only guard, middleware matcher, and dashboard-vs-repo drift.

All four agents independently flagged the missing `'server-only'` guard, the healthcheck `String(err)` leak, the missing fetch timeout, and the email-not-UNIQUE issue — high-confidence items.

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
