# Cross-session coaching continuity (open-threads injection)

Architectural sketch for a feature that injects "what was left
unfinished from recent sessions" into the session-start prompt.
Captured during a planning conversation on 2026-05-02.
**Not yet implemented — and not yet justified by user feedback.**

## Status

**ON HOLD pending real-user signal.** This was designed in response
to a hypothetical concern ("does the coach lose context across
sessions?") raised by another planning session, not from observed
beta-tester complaints. We're holding the design here so that if a
tester ever surfaces the gap, we can ship the lightweight version
without re-deriving the analysis from scratch.

## Trigger condition (when to revisit)

Build this when **one or more of**:

- A beta tester says something like: "the coach feels like it forgets
  what we worked on last time," "I have to re-explain context every
  session," or "my sessions don't feel connected."
- A tester mentions an unresolved thread from a prior session that the
  coach failed to surface or acknowledge when it would have been
  useful.
- During session review, you (Steven) notice the coach treating a user
  as fresh in a way that materially undercuts the work.

If beta sessions feel adequately connected as-is, the existing
mechanisms (last-session summary, recent breakthroughs, growth
narrative, style calibration) are doing the job and this doesn't
need to ship.

## Problem

A long-term human coach naturally remembers what's been worked, what
shifted, what was tried, and especially what was *left open*. Those
memories shape the most valuable coaching moves: noticing a pattern
the user named three sessions ago, gently pushing back on avoidance
the user has a track record of, picking up a thread the user said
they wanted to come back to.

Right now those moves are structurally unavailable to InnerVerse's
session prompt. The coach gets factual context (last summary, active
goals, recent breakthroughs, style feedback, growth narrative) but
not "what's still alive and unfinished."

## What's already injected (do not duplicate)

`src/lib/coaching-prompt.ts` → `formatClientProfile` already sends a
developer message at session start with:

- `Client: <user_name>`
- `Persona: <coach_name>`
- `Style calibration (JSON): {directness, warmth, challenge}`
- `Recent style feedback: <natural-language summary>`
- `Active goals: <formatted list>`
- `Recent breakthroughs/milestones: <last 5>`
- `Continuity note (last session summary): <last summary>`
- `Today's focus (goal): <title>` (if user picked a focus)

Plus `coaching_state.growth_narrative` exists as a cumulative
"letter from your coach" — but it's optimized for *user-facing*
emotional resonance, not coach-facing fidelity.

The gap this plan fills is specifically **unresolved threads** —
things the user mentioned but didn't work, or said they'd come back
to. Nothing in the current data captures that.

## Recommended scope: lightest version only

A planning conversation surfaced a 3-tier spectrum:

1. **Lightest**: last-session continuity — what was worked, what
   shifted, what was left open
2. **Middle**: rolling working-edges summary across recent sessions
3. **Heaviest**: full user model — patterns, tendencies, avoidances

**Build the lightest version only.** It captures most of the value
with the lowest pattern-locking risk. The middle and heavy versions
are tempting but introduce real failure modes (premature
pattern-locking, loss of beginner's mind, self-fulfilling framing,
compounding-error ossification). Don't build them speculatively.

## Failure modes to design against

These are real and named in advance so the implementation can include
structural defenses:

- **Premature pattern-locking** — once told "this user avoids
  vulnerability," the model looks for confirming evidence and may
  miss when the user is doing something genuinely new.
- **Loss of beginner's mind** — the current setup's quiet strength
  is meeting the user where they actually are today, not where the
  system has decided they are.
- **Compounding errors** — a misread session enters the brief, which
  influences the next session, which gets summarized again. Small
  interpretive errors ossify into "facts." Mitigate by re-deriving
  from raw recent session data each time, not from
  summaries-of-summaries.
- **Self-fulfilling framing** — "user struggles with boundaries"
  subtly steers sessions toward that frame even when the user shows
  up wanting something else.
- **Wrong-register reuse** — `growth_narrative` is for users (prose,
  resonant). A coach brief needs a different register (terse,
  uncertainty-preserving, question-shaped). Don't reuse the existing
  output.

## Structural defenses

The "hold this lightly" instructional framing is necessary but not
sufficient — LLMs latch onto context whether you tell them to or
not. Stronger defenses:

- **Keep it short.** 3-5 short threads max, total. Less surface area
  for the model to fixate on.
- **Phrase as questions, not assertions.** Not *"User avoids talking
  about Dad"* but *"Has the Dad thread come back up?"*
- **Re-derive from raw recent sessions each time.** Don't carry
  summaries-of-summaries forward. The synthesis prompt should read
  the actual session messages from the last N sessions, not
  previously-extracted threads.
- **Sliding window with decay.** A thread should fall off after N
  sessions of not being referenced. Don't accumulate forever.
- **Explicit "discard if not resonant" instruction.** Give the model
  permission — and a duty — to ignore context that doesn't fit what's
  actually surfacing today.

## Concrete implementation plan

If/when you build this, the lightest version maps cleanly to the
current architecture:

### Schema

Add to `coaching_state`:

```sql
ALTER TABLE coaching_state
  ADD COLUMN open_threads jsonb DEFAULT '[]'::jsonb;
```

Each entry shape:

```json
{
  "thread": "Has expressed wanting to revisit the conversation with Dad",
  "from_session_id": "uuid",
  "first_noted_at": "2026-05-02T...",
  "last_referenced_at": "2026-05-02T...",
  "ttl_sessions": 5
}
```

`ttl_sessions` decrements on each session that doesn't reference the
thread. When it hits 0, drop the thread.

### Synthesis (post-session analysis extension)

Extend `prompt-session-end-vN-gpt-X.md` to also extract
`open_threads`. Output schema additions:

- `open_threads_added`: array of new threads from this session
- `open_threads_addressed`: array of thread descriptions that were
  worked on this session (so they can be marked closed)

The session-end RPC merges these into `coaching_state.open_threads`:
adds new ones, removes addressed ones, decrements TTL on unreferenced
ones.

Important: synthesis reads the **raw session messages**, not previous
summaries. This prevents compounding interpretive errors.

### Injection (session-start prompt)

In `src/lib/coaching-prompt.ts` `formatClientProfile`:

```ts
const liveThreads = (coachingState.open_threads ?? [])
  .filter(t => t.ttl_sessions > 0)
  .slice(0, 5);
const threadsLine = liveThreads.length > 0
  ? `Open threads from recent sessions (hold loosely; questions to keep in mind, not facts to act on):${bulletList(liveThreads.map(t => t.thread))}`
  : "";
```

Append to the existing developer message. The bullet format matches
the existing `Recent breakthroughs/milestones` field for parsing
consistency.

### Master coaching prompt update

Add one short paragraph to `prompt-v11.4-gpt-5.4.md` (or whichever
is current at that time) explaining how to use the open-threads
field:

> If the client profile includes `Open threads from recent sessions`,
> hold these as questions worth carrying — not as facts about the
> user. They are the system's best guess at what may still be alive
> from prior sessions. Surface them only if they fit what the user is
> bringing today; ignore them otherwise. They are not assignments.

### First-session handling

`open_threads` is empty on first session — no special-casing needed.
The injection helper renders nothing when the array is empty.

### Cost / latency

- Synthesis: extension to existing post-session analyzer call. No new
  OpenAI request. Marginal token increase.
- Injection: ~5 short bullet points added to the existing developer
  message. Negligible.

## Decisions made (locked in if/when this ships)

- **Lightest version only** — no middle or heavy version without a
  separate decision and additional failure-mode design.
- **No new prompt file** — extends the existing session-end analyzer
  and the existing master coaching prompt.
- **No new dedicated synthesis call** — reuses the post-session
  analyzer's existing OpenAI request.
- **Sliding window with TTL**, not unbounded accumulation.
- **Synthesis reads raw session messages, not prior summaries** —
  prevents compounding interpretive errors.
- **One column on existing `coaching_state` table**, not a new table.
- **No UI changes** — this is internal coaching context, not
  user-facing.

## Open questions to resolve at build time

- What's the right `ttl_sessions` default? Probably 4 or 5. Tune
  based on first batch of real threads.
- Cap on threads injected: 5 feels right; could be 3.
- Should "addressed" threads be deleted, or moved to a separate
  archive column for analytics? Probably deleted; otherwise we're
  building two things at once.
- Does the synthesis call also need access to *prior* `open_threads`
  to detect when an old thread was implicitly resurfaced? Maybe.
  Worth experimenting; start without it.

## Why this is on hold

Identified gap may not be real. The current context injection
(last summary + breakthroughs + goals + style + growth narrative)
already covers a lot of cross-session continuity. Whether
"open threads" specifically matter depends on whether testers
actually feel the loss. **Don't build for hypothetical problems.
Wait for signal, then ship the lightest version above.**
