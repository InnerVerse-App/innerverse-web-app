# InnerVerse quality-systems checklist

**What this is:** the project-specific quality checklist for the
InnerVerse web app. Paste at the start of every significant session
(feature work, infra changes, deploys). Short / trivial sessions can
skip — the SessionStart hook primes review-cadence context
automatically.

**Living document:** if a bug class hits real users that the matrix
didn't flag, add a matrix row before the next work. Never retroactively
rewrite; append and date the change in the changelog at the bottom.

**Related infrastructure** (already installed in Phase 2):

- [CLAUDE.md](../../CLAUDE.md) `## Review cadence` section
- [Docs/review-cadence/audit-prompt-template.md](audit-prompt-template.md) — fresh-session audit prompt
- `.claude/hooks/check-audit-pending.sh` — SessionStart reminder
- `Docs/KNOWN_FOLLOW_UPS.md` — audit finding ledger
- Auto-memory: `feedback_review_cadence.md`

---

## 1. Pillars (3 active, 2 deferred)

Canonical five-pillar model was adapted to what actually works on this
repo today. The rule: 3 pillars that run beats 5 pillars where 2 are
placeholders.

### Active pillars

#### Pillar A — Static verification

**What runs:** `npm run lint` (ESLint 9 + `eslint-config-next`), Vercel
build on every PR preview and on `main` push, `/api/healthcheck`
endpoint confirming Supabase reachability.

**When it runs:** automatically on every `git push`.

**Gaps:** no `tsc --noEmit` script wired (though it works manually), no
unit test runner installed, no pre-commit hooks. See "Known gaps" below
for Phase-gated revisit triggers.

#### Pillar B — Code review

**What runs:** `/simplify` after every PR merge (reviews the merged
chunk for reuse, quality, efficiency), fresh-session audit at milestone
gates (zero-prior-context Claude Code session using the audit template).

**When it runs:**

- **`/simplify`** — manually invoked after every merge, before new work
  begins. CLAUDE.md enforces this. Findings append to
  `Docs/KNOWN_FOLLOW_UPS.md`.
- **Fresh-session audit** — at the milestone gates listed in Section 3
  ("Milestone gates"). Findings append to the same ledger.

**Gaps:** none — this pillar is fully wired today.

#### Pillar C — Observability

**What runs:** Vercel function + build logs (automatic per deploy),
Supabase dashboard (manual inspection of slow queries + errors), Clerk
dashboard (manual review of auth events).

**When it runs:** continuous for logs; manual for dashboards. At
minimum, check each dashboard for 24h after any production deploy that
touches auth, DB writes, or the session pipeline.

**Gaps:** Sentry is unwired (`NEXT_PUBLIC_SENTRY_DSN` slot exists in
`.env.example` but empty). PostHog / analytics not in scope for Phase
3. Revisit trigger: wire Sentry before Phase 10 (pre-launch gate).

### Deferred pillars

#### Content validator — DROP until static data exists

InnerVerse has no curriculum or fixture data to validate today.

**Revisit trigger:** introduce this pillar the moment a static dataset
lands (coach-persona catalog, onboarding-options list, prompt-variant
registry, anything checked into the repo that the app reads as data).

#### Runtime validator / E2E — DROP until Phase 6-7

The session pipeline doesn't exist yet. Writing E2E tests against a
pipeline you haven't built is placeholder theatre.

**Revisit trigger:** when Phase 6 (session-start flow) or Phase 7
(session-end processing) lands. Minimum viable happy-path: sign up →
onboard → start session → send message → end session → verify
session-end JSON wrote the expected rows. Tool: Playwright most likely,
but revisit tool choice at that moment. This MUST be installed before
the Phase 10 pre-launch gate.

---

## 2. Change-type matrix

Adapted to the 3 active pillars. Columns:

- **Lint** — `npm run lint` passes
- **Build** — Vercel preview build passes
- **Review** — `/simplify` after merge (always) + fresh-session audit
  (at milestone gates only, see Section 3)
- **Obs.** — post-deploy observability check (Vercel logs + Supabase /
  Clerk dashboards for 24h)
- **Backup** — Supabase PITR snapshot before the change

| Change type | Lint | Build | Review | Obs. | Backup |
|---|:-:|:-:|:-:|:-:|:-:|
| UI component or page edit (`src/app/...` non-API) | ✅ | ✅ | ✅ | — | — |
| API route edit (`src/app/api/.../route.ts`) | ✅ | ✅ | ✅ | ✅ | — |
| Shared lib edit (`src/lib/...`) | ✅ | ✅ | ✅ | ✅ if session-pipeline | — |
| Clerk middleware change (`src/middleware.ts`) | ✅ | ✅ | ✅ **audit req. (auth lens)** | ✅ | — |
| Prompt file change (`reference/prompt-*.md` or inline prompt assembly) | — | — | ✅ regression review | ✅ | — |
| Session-end JSON schema / parser change (Phase 7+) | ✅ | ✅ | ✅ **audit req. (data-integrity lens)** | ✅ | ✅ |
| DB migration on user-owned tables (Phase 4+) | ✅ | ✅ | ✅ **full audit** | ✅ | ✅ |
| RLS policy change (Phase 4+) | ✅ | ✅ | ✅ **audit req. (security + data-integrity lenses)** | ✅ | — |
| New dependency in `package.json` | ✅ | ✅ | ✅ (security + license check) | — | — |
| New env var / config secret | — | ✅ | ✅ | ✅ | — |
| Infrastructure change (Vercel settings, GitHub repo settings) | — | — | ✅ | ✅ | — |
| Production deploy (any) | — | — | — | ✅ 24h | — |
| Documentation-only / `reference/` edit | — | — | — | — | — |

**"audit req." rows:** a fresh-session audit is mandatory for this
change type even outside the named milestone gates. These are the
irreversible / high-blast-radius categories.

---

## 3. Universal rules

### Before committing

State the change type + which pillars apply + whether each ran and
passed + whether existing data was overwritten (and why that's ok).

### Dry-run before apply

Any script that writes to DB / files / external services: run
`--dry-run` first, verify output, then apply. Particularly critical for
Phase 7 (session-end processing) — the LLM returns JSON that gets
written atomically across ~6 tables; any bug hits prod user data the
first time you notice.

### Per-chunk "what could go wrong"

Name 3-5 concrete failure modes (unexpected input, race conditions,
upstream errors, idempotency, stale cache, partial LLM response,
malformed JSON, timeout mid-stream) and state whether each is handled
or out of scope.

### Milestone gates — fresh-session audit required before

- Opening to >10 real testers
- Accepting any payment
- Storing PII beyond email + display name
- Any production deploy that changes authentication or data-handling code
- Any database migration that alters user-owned tables
- Pre-launch (Phase 10)
- Pre-public-beta / trusted-tester dry run (Phase 11)

### Red flags — STOP if true

- "I'll skip the dry-run this once" — no
- "Same error 2-3 times, let me try one more thing" — stop, summarize, ask
- "I'll add a helper / abstraction / error handler just in case" — no, default to boring
- "We can manually test instead" — manual testing catches UX, not security / data-integrity
- "Native reviewers aren't available" — queue, don't skip
- "11.9 GB was lost to this in 2026-04" (Govori lesson) — don't write
  data to ephemeral paths; for InnerVerse, the equivalent is: never
  store anything meaningful in `.next/`, `node_modules/`, or `/tmp/`
  expecting it to persist

### Honest-reporting rules

- If any system was skipped, say so explicitly in the PR description + why
- If a system doesn't apply, say why (pointing at the matrix row)
- Never claim "passes lint" or "passes audit" without showing the output
- If a new category of bug slipped past all systems and hit a real
  user, update the matrix before the next work

### End-of-session self-check

Walk the matrix against the session's changes. Flag any pillar that
was skipped without a stated reason.

---

## 4. Known gaps — revisit triggers

Gaps are intentional under the "3 that work" rule. Each has a named
trigger that moves it from deferred to required.

| Gap | Revisit trigger |
|---|---|
| E2E test runner (Playwright) | Phase 6 (session-start flow) or Phase 7 (session-end) lands. MUST be installed before Phase 10 pre-launch gate. |
| Unit test runner (vitest/jest) | Phase 4 DB code lands, OR first shared-lib utility with non-trivial branching logic is added to `src/lib/`. |
| Sentry (error tracking) | Before Phase 10 pre-launch gate. DSN slot already in `.env.example`. |
| `tsc --noEmit` script | Add when type-errors start appearing between `next build` runs — low priority while Vercel's build catches them. |
| Pre-commit hooks (husky / lefthook) | Deferred indefinitely. Vercel build catches lint/type failures before merge. Revisit only if a class of bug slips through that a pre-commit check would have caught. |
| Staging environment | Deferred. Preview (per-PR) + Production is sufficient while user base < 10. Revisit before opening to >10 real testers. |
| Database migrations system | Phase 4. Tool choice (Supabase CLI migrations vs drizzle-kit vs raw SQL in `Docs/migrations/`) undecided — settle at that moment. |
| Content validator pillar | A static dataset is introduced to the repo (coach personas, onboarding options, prompt-variant registry). |

---

## Changelog

- **2026-04-21** — Initial version. 3 active pillars (Static
  verification, Code review, Observability), 2 deferred (Content
  validator, Runtime validator). Matrix covers 13 change types.
