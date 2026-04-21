# InnerVerse fresh-session audit template

**Purpose.** A self-contained prompt a fresh Claude Code session can
execute on the InnerVerse repo with zero prior context. Produces an
adversarial review at milestone gates (see `CLAUDE.md § Review cadence`).

**How to run.** Open a new Claude Code session on this repo. Paste the
`## Prompt` block below, filling in `<SCOPE>` and `<LEDGER_PATH>`.
Do not load any other context — the point is a cold, unbiased pass.

**Inputs.**

- `<SCOPE>` — what to audit. Examples:
    - `HEAD~3..HEAD` (the last 3 commits on main)
    - `main..<branch-name>` (an open PR)
    - `src/app/api/session-end/` (a specific directory)
    - `all code added since <SHA>` (a free-text range)
- `<LEDGER_PATH>` — where findings go. Default:
  `Docs/KNOWN_FOLLOW_UPS.md`. Always relative to repo root.

---

## Prompt

You are running a cold, adversarial review of a specific scope in the
InnerVerse repo. You have no prior context from earlier sessions — that
is deliberate. Do not skim. Actually look.

**Scope to audit:** `<SCOPE>`
**Ledger to append findings to:** `<LEDGER_PATH>`

### What this repo is

InnerVerse is a Next.js 15 (App Router, TypeScript) web app that
delivers AI-driven coaching sessions. Key surfaces that need special
care:

- **Clerk** for authentication (magic-link, dev instance as of audit
  time)
- **Supabase** (Postgres) for data, with row-level security policies
  that gate user data by `auth.uid()` (once schema lands)
- **OpenAI `/v1/responses`** for coaching-model calls — session-start
  (`gpt-5`), per-message chat (`gpt-5.2`), session-end analysis
  (`gpt-5`). Prompt files live under `reference/`.
- **Session-end processing** parses a structured JSON response from the
  LLM and writes across multiple tables atomically. This is the
  single highest-risk surface for data corruption.
- **Vercel** hosting with PR-preview deploys and `main` → production
  deploys.

See `CLAUDE.md` for operator context and `reference/decisions.md` for
the canonical decisions list.

### Step 1 — Spawn four parallel review agents

Use the Agent tool with `subagent_type=Explore` to spawn **four
parallel agents**, one per lens. Each agent reads the scope
independently and cannot see the others' findings. Brief each agent
with its lens plus the blind-spot checklist in Step 2.

| Lens | Focus |
|---|---|
| **Security** | Auth / authorization boundaries, injection (SQL, prompt, command), XSS, CSRF, open redirects, secret handling, cryptographic misuse, SSRF, missing rate limits, session management, cookie flags, CORS |
| **Data integrity** | Transactions, concurrent writes, partial updates, race conditions on signup / onboarding / session-start, ephemeral-path writes that will be lost, missing cleanup on error paths, migration round-tripping, FK / cascade correctness, RLS policy gaps, `auth.uid()` bypass paths |
| **Correctness** | Off-by-one, state transitions that skip states, unreachable branches that ARE reachable, external API shape assumptions, timezone handling, `null` / `undefined` handling, swallowed errors, implicit string coercion, boundary conditions on session-end JSON parsing |
| **Architecture** | Layer boundaries (client vs server, auth vs data), leaky abstractions, circular deps, insecure defaults (env vars, middleware matchers, feature flags), resource exhaustion (unbounded loops, missing timeouts on OpenAI calls, unbounded caches), drift between declared shape and runtime shape |

### Step 2 — Mandatory blind-spot checklist

Hand this list to **every agent**. Each agent must either flag items
against the scope or explicitly state "not applicable to this scope
because [reason]" — **silence is not acceptable**.

1. **Chained vulnerabilities** — each individually minor but combined
   serious (e.g. verbose errors + predictable IDs)
2. **TOCTOU races** — check-then-use windows where state can change
3. **Layer-boundary assumption mismatches** — caller expects X, callee
   returns Y (especially between client components and server handlers)
4. **Auth edge cases** — session replay, race on signup, concurrent
   onboarding, password-reset gaps, email-change flows, sign-in after
   account deletion
5. **Data-loss patterns** — writes to ephemeral paths (`/tmp`,
   `.next/`, worktree `.git/`), missing transactional guards around
   multi-step writes, non-atomic multi-table updates, session-end
   writes that partially succeed
6. **Silent failures** — swallowed `catch` blocks, errors not
   reported to Sentry (once wired), retry loops that mask real bugs,
   Promise.all that loses one rejection
7. **Trust-boundary input handling** — XSS in rendered content, SQL
   injection via raw queries, path traversal, **prompt injection**
   via user messages that manipulate the coach, open redirect via
   `redirect_to` params
8. **State-machine unreachables that ARE reachable** — "impossible"
   states we never test because we believe they can't happen
9. **Default-insecure flags** — env vars with permissive defaults,
   feature flags that default on, config defaults that assume dev
   environment
10. **Resource exhaustion** — unbounded loops, missing HTTP timeouts
    (especially to OpenAI — responses can be very long), unbounded
    caches, per-request memory growth from accumulating message
    arrays, no abort on user-close
11. **Cross-component / cross-runtime consistency** — the same
    invariant enforced in TypeScript may be bypassed by a direct
    Supabase admin-client write from a server action, or by an
    external integration
12. **Secrets in code or logs** — API keys, JWT secrets, connection
    strings, service role tokens in error messages, telemetry event
    payloads, console.logs committed
13. **Failure-mode behavior** — when a happy path breaks, does the
    system fail closed (deny by default) or fail open (grant by
    default)? Especially relevant for auth checks and RLS

### Step 3 — Output format

Each finding must be structured:

```
FINDING <N>
Severity: CRITICAL | HIGH | MED | LOW
Lens: security | data-integrity | correctness | architecture
Location: <file>:<line-or-range>
Root cause: <one sentence, what is actually wrong>
Blast radius: <who is affected, under what conditions, what is the worst-case outcome>
Suggested fix: <concrete action — don't just say "handle this better">
Status: OPEN
```

**Severity guide:**

- **CRITICAL** — silent data loss, auth bypass, RCE, or leaked
  secrets. Block merge.
- **HIGH** — exploitable vulnerability, integrity risk, or failure
  mode with real-user impact. Fix before next milestone gate.
- **MED** — correctness bug or architectural smell that will bite
  later. Schedule.
- **LOW** — cleanliness, missing guard that's defense-in-depth.

### Step 4 — Append findings to the ledger

After all four agents return, aggregate the findings into a single
dated section and append to `<LEDGER_PATH>`. Use this format:

```
## Audit <YYYY-MM-DD> — scope: <SCOPE>

### Summary
<N> findings total: <N critical>, <N high>, <N med>, <N low>.
<one-paragraph summary of themes and anything notable>

### Findings

<FINDING 1>
<FINDING 2>
...
```

If an agent explicitly states "no findings for this lens because
[reason]", include that too — it confirms the lens ran, didn't just
hallucinate silence.

### Step 5 — Report back

At the end of the session, summarize:

- Total findings per lens + per severity
- Any findings you think the non-developer operator must see today
  (CRITICAL or actionable HIGH items)
- Whether the ledger file was updated (path + commit-ready diff, or
  note that the ledger edit was not committed and needs the operator
  to review)

Do **not** run `/simplify` or any other slash command from this
session. This is a read-only review. Code changes go through the
normal PR workflow in a separate session.

### Guardrails

- If the scope is ambiguous, stop and ask the operator to clarify
  before spawning agents.
- If an agent returns nothing (silent), that is a bug in the audit,
  not a clean result. Re-run that lens with a narrower scope.
- Do not skip the blind-spot checklist even if the scope seems small.
  "Nothing applies" is a valid per-item answer, but you must say so.
- Do not fabricate file paths or line numbers. If you can't find
  something exact, say `<file>:<unknown>` and flag the uncertainty.
