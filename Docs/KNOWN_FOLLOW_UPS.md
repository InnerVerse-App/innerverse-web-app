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
