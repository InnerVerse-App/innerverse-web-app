# Supabase (Phase 4)

Scaffold for schema migrations. No tables yet — those arrive in Chunk 4.2+.

## Two projects

Per `reference/decisions.md` → Database strategy:

| Role | Project | Used by | Tier |
|---|---|---|---|
| Dev | `innerverse-dev` | Vercel Preview deploys | Free |
| Prod | `innerverse-prod` (ref: `ypupvssqcunetzjddwoy`) | Vercel Production deploys | Free; upgrades to Pro at the ">10 testers" gate |

**Canonical source for refs:** the Supabase dashboard URL (e.g. `https://supabase.com/dashboard/project/<ref>`) and the `NEXT_PUBLIC_SUPABASE_URL` Vercel env var (the subdomain *is* the ref). To look up: Supabase dashboard → your project → Settings → General → Reference ID.

## Workflow (how schema changes ship)

Every migration follows this order: dev first, audit, then prod. **Untested end-to-end until Chunk 4.2 lands the first real migration** — these commands are the intended path, not a verified one.

```bash
# 1. One-time login (browser flow; token cached in ~/.supabase)
npx supabase login

# 2. Write a new migration locally
npx supabase migration new add_sessions_table
# creates supabase/migrations/YYYYMMDDHHMMSS_add_sessions_table.sql
# edit that file with your forward SQL + a companion rollback comment

# 3. Apply to DEV first
npx supabase link --project-ref <dev-ref>
npx supabase db push

# 4. Smoke-test dev (hit /api/healthcheck on a Preview deploy pointing at dev)

# 5. Run the fresh-session audit (see Docs/review-cadence/audit-prompt-template.md)

# 6. Only after audit passes: apply to PROD
# ⚠ DANGER: the next two commands touch innerverse-prod (real-user data
#    once testers land). Re-link intentionally; this is not a dry run.
npx supabase link --project-ref ypupvssqcunetzjddwoy
npx supabase db push
```

## Backups on Free tier

Free tier has no automatic backups. See `Docs/KNOWN_FOLLOW_UPS.md` entries dated 2026-04-21 ("Phase 4 pre-decisions"). For pre-tester migrations, the mitigation is:

- Every migration SQL committed to git (this is the backup).
- Write a rollback SQL comment block alongside the forward migration.
- Before any destructive change (DROP, ALTER TYPE, etc.), run `pg_dump` to a local `.sql` file.

The `innerverse-prod` project upgrades to Pro (7-day PITR) at the ">10 testers" milestone gate.

## Files in this folder

- `config.toml` — Supabase CLI config (mostly for local-dev via `supabase start`; not required for remote-only workflows).
- `migrations/` — Forward SQL migrations, timestamped by the CLI.
- `.gitignore` — excludes `.branches` and `.temp` (CLI-generated local state).
- `.temp/` (gitignored) — local CLI scratch space.

## Out of scope for Chunk 4.1a

- Clerk JWT template + `src/lib/supabase.ts` updates (Chunk 4.1b)
- First real migration (Chunk 4.2 — identity tables, milestone gate)
