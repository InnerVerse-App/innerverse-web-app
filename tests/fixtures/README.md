# Pre-launch fixture runner

Hand-crafted coaching transcripts you can run through the V.5a
session-end pipeline (Call 1) and the response-parser (Call 2)
without ever opening a real chat session. Use this to sanity-check
prompt and schema changes before testers see them.

## What it does

`scripts/run-fixture.mjs` loads a fixture JSON file, inserts a
synthetic `sessions` + `messages` row pair on `innerverse-dev`
under a dedicated test user (`fixture_test_user_v5a`), runs the
exact same OpenAI prompts and Postgres RPCs production uses, then
re-queries the resulting DB state and pretty-prints it.

The runner uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS — it
never touches your real account or any tester data. Rows are left
in place for inspection; clean up later with:

```sql
delete from sessions where user_id = 'fixture_test_user_v5a';
delete from users    where id      = 'fixture_test_user_v5a';
```

(Cascading FKs handle messages, themes, insights, breakthroughs.)

## Usage

From the repo root, with `.env.local` populated (must include
`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`OPENAI_API_KEY`):

```bash
# Call 1 only — session-end analysis
node --env-file=.env.local scripts/run-fixture.mjs tests/fixtures/sessions/01-vulnerable-shift.json

# Call 1 + Call 2 — also exercises the response-parser
node --env-file=.env.local scripts/run-fixture.mjs \
  tests/fixtures/sessions/01-vulnerable-shift.json \
  --response "Yes, the autopilot framing landed. The 'buried voice' framing didn't — that wasn't quite what was happening for me."
```

Each run takes ~10–30 s depending on model latency. Cost is roughly
2–5 ¢ per run.

## What each fixture is testing

| File | What's expected |
|------|-----------------|
| `01-vulnerable-shift.json` | ≥1 mindset shift with non-empty `evidence_quote`, themes marked `is_new_theme=true`, no trauma flag |
| `02-defensive-stuck.json` | NO shifts, NO breakthroughs (rubric demands evidence ≥7 with a clear contradicted-pattern moment — none here), themes with `direction='stuck'` |
| `03-trauma-marker.json` | `trauma_protocol_triggered=true`, NO shifts, NO breakthroughs (suppression), `recommended_next_steps` points at professional support |
| `04-first-session.json` | Bootstrap-empty-context path works; introductory `session_summary`; themes all `is_new_theme=true`; NO shifts (first session ≠ shift territory) |

## Adding a fixture

A fixture is just JSON:

```json
{
  "description": "What this is testing and what to expect.",
  "clientFirstName": "Alex",          // optional
  "coachPersona": {                   // optional
    "name": "Maya",
    "description": "calm and centered, helps you find inner peace"
  },
  "priorContext": "...",              // optional override of the
                                      // generated developer-message
                                      // context block; useful for
                                      // testing cross-session
                                      // continuity
  "messages": [
    { "role": "coach", "content": "..." },
    { "role": "user",  "content": "..." }
  ]
}
```

`role` accepts `coach`/`assistant` (mapped to `is_sent_by_ai=true`)
or `user`/`client` (mapped to `is_sent_by_ai=false`).

## Schema sync caveat

The runner duplicates `SESSION_END_SCHEMA` and
`SESSION_RESPONSE_SCHEMA` as inline constants. If you bump a prompt
or add a field in `src/lib/session-end.ts` or
`src/lib/session-response.ts`, **also update the matching constant
in `scripts/run-fixture.mjs`**. Drift surfaces at runtime as an
OpenAI strict-mode rejection — easy to detect, awkward to debug
mid-session-iteration. The script's header comment flags this.
