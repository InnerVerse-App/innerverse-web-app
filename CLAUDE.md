# CLAUDE.md — persistent context for Claude Code sessions

This file is loaded at the start of every Claude Code session on this
repo. It captures operator context, the review cadence, and pointers to
deeper reference material so future sessions don't have to re-derive
them.

## Who runs this repo

Steven, solo, non-developer operator. Cannot review code line-by-line.
Compensates by relying on: managed services, boring standard approaches,
short testable chunks, and the automated review cadence below.

## Source of truth for decisions

`reference/decisions.md`. Anything that conflicts with `decisions.md` is
wrong — update `decisions.md` first, then adjust.

Other reference material under `reference/`:

- Live prompts embed their pinned model in the filename (e.g., `prompt-X-gpt-5.2.md`). When you change the model in `src/lib/openai.ts`, rename the file to match.
  - `prompt-session-opener-gpt-5-mini.md` — focus-aware opening rules; governs the coach's first message only
  - `prompt-v11.3-gpt-5.2.md` — master coaching prompt (operator-authored); governs every turn after the opener, sent verbatim
  - `prompt-session-end-v7-gpt-5.2.md` — session-end analysis prompt (returns structured JSON)
  - `prompt-session-response-v2-gpt-5-mini.md` — post-session reflection parser
  - `prompt-growth-narrative-v1-gpt-5.md` — cumulative "Message from your Coach" letter
  - `prompt-style-calibration-v1-gpt-5-mini.md` — feedback-driven style calibration aggregator
- `archive/` — superseded prompts (prompt-coaching-chat.md, session-end v5/v6, session-response v1) kept for diff/reference, not loaded by any live code
- `app-data-export.json` — privacy policy, terms, legacy Bubble config
- `screenshots/` — UI, data-type, backend-workflow, API-connector, Figma
- `logos/` — brand assets

## Review cadence

This repo uses a four-layer AI review system. **Every session must
participate in the cadence**, not just respond to explicit prompts.

- **After every PR merge**, run `/simplify` on the merged chunk before
  starting new work. Don't queue this across multiple merges — do it
  between PRs.
- **At milestone gates**, run a fresh-session audit using
  `Docs/review-cadence/audit-prompt-template.md` (zero prior context, in
  a new Claude Code session). The gates are:
    - Before opening to more than 10 real testers
    - Before accepting any payment
    - Before storing PII beyond email + display name
    - Before any production deploy that changes authentication or data-handling code
    - After any database migration that alters user-owned tables
    - Pre-launch (Phase 10 of the approved build plan)
    - Pre-public-beta / trusted-tester dry run (Phase 11 of the approved build plan)
- **Findings append to `Docs/KNOWN_FOLLOW_UPS.md`** — one numbered entry
  per finding under a dated section. Status transitions stay in the
  ledger; never delete old entries.
- **The SessionStart hook** (`.claude/hooks/check-audit-pending.sh`)
  silently checks whether merges have landed since the last audit. If
  pending > 0, it prints a reminder when a session starts. Treat its
  output as ground truth for "what needs auditing."
- **Honest limit**: AI review catches a lot but not everything. Static
  analysis and adversarial prompts cannot substitute for real-user
  telemetry or manual human inspection at the milestone gates above.

## Build philosophy

- **Plan before coding.** Wait for approval on anything beyond a
  one-line fix.
- **Small chunks.** Every change should be eyeball-reviewable in five
  minutes.
- **Boring, standard approaches.** No clever abstractions, no
  speculative helpers. Default to the dumbest working version.
- **Don't add what wasn't asked for.** Three similar lines beats a
  premature abstraction.
- **Managed services over custom code** for anything risky: auth
  (Clerk), database (Supabase), hosting (Vercel), error tracking
  (Sentry when wired).
- **Commit after every working chunk.** Git from day one.
- **Ask "what could go wrong"** after each chunk — enumerate 3-5
  concrete failure modes and state whether each is handled or out of
  scope.
- **Stop when stuck.** Same error 2-3 times → stop, summarize, ask.

## Architecture pointers (will expand as we build)

- Next.js 15 App Router in `src/app/`
- Shared utilities in `src/lib/`
- API route handlers in `src/app/api/`
- Clerk middleware in `src/middleware.ts`
- Environment variables: `.env.local` locally (gitignored), Vercel env
  for Preview and Production; see `.env.example` for the full list

## Currently unwired but planned

- Sentry (DSN slot exists in `.env.example`)
- OpenAI `/v1/responses` (Phase 6-7)
- Any database schema (Phase 4)
- Sign-in / sign-up UI (Phase 3)
- PWA manifest + service worker (Phase 3)
