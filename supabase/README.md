# Supabase

Schema migrations live in `migrations/`. The first migration (identity tables) is staged in Chunk 4.2.

## Two projects

Per `reference/decisions.md` → Database strategy:

| Role | Project | Used by | Tier |
|---|---|---|---|
| Dev | `innerverse-dev` | Vercel Preview deploys | Free |
| Prod | `innerverse-prod` (ref: `ypupvssqcunetzjddwoy`) | Vercel Production deploys | Free; upgrades to Pro at the ">10 testers" gate |

**Canonical source for refs:** the Supabase dashboard URL (e.g. `https://supabase.com/dashboard/project/<ref>`) and the `NEXT_PUBLIC_SUPABASE_URL` Vercel env var (the subdomain *is* the ref). To look up: Supabase dashboard → your project → Settings → General → Reference ID.

## Hosted-project setup (dashboard, not in repo)

Some configuration lives in the Supabase dashboard rather than `config.toml`. Both `innerverse-dev` and `innerverse-prod` need this done; drift between them is a real risk (Audit 2026-04-22 F24).

| Setting | Where | Value |
|---|---|---|
| Clerk → Supabase third-party auth | Authentication → Sign In / Providers (or Third-party Auth) → Clerk | Enabled, Clerk domain URL pasted from Clerk dashboard's Supabase integration screen |
| Database role for app | Authentication → Roles | `authenticated` (default; nothing to change) |

When setting up a brand-new Supabase project for InnerVerse: complete the table above before applying any migration.

## Conventions

- **Every user-owned table MUST specify `ON DELETE CASCADE`** on its FK to `users(id)` (or document why it shouldn't). Postgres defaults to `NO ACTION`, which would orphan rows after a user-deletion via the Clerk webhook (Audit F6).
- **RLS on user-owned tables is never disabled.** The migration uses `ALTER TABLE ... FORCE ROW LEVEL SECURITY` so even table owners can't bypass it without explicitly turning off `FORCE`. A dashboard-side "Disable RLS" click on a user-owned table is treated as an incident (Audit F17, F22).
- **Trigger functions are shared.** `set_updated_at()` is reused across all tables that have an `updated_at` column. Modifying it changes behavior for every consumer; if behavior needs to diverge, fork into a per-table function rather than special-casing inside (Audit F21).
- **All `CREATE` and `DROP` statements use `IF [NOT] EXISTS`** so partial-failure recovery and re-application are safe (Audit F11).

## Pre-apply checklist (every migration)

Before running `npx supabase db push` against either project — even dev — verify the items below. They prevent silent integration failures that would otherwise only surface at the first real query (Audit F18).

1. **Clerk JWKS integration is live in this project.** Supabase dashboard → Authentication → Sign In / Providers → Clerk shows "Enabled" with a domain URL.
2. **`auth.jwt()->>'sub'` returns the Clerk user ID.** Sign in via Clerk in a temporary script, decode `getToken()`'s output, and assert the `sub` claim equals the user's Clerk ID. Without this, every RLS policy using `auth.jwt()->>'sub'` fails closed and queries silently return zero rows (Audit F1, F7).
3. **`pg_dump` of the target project is saved locally** if the project has any data. (Free-tier projects have no automatic backups; this is your only rollback artifact until the Pro upgrade lands.)
4. **The migration SQL is reviewed by a fresh-session audit** if it touches user-owned tables, RLS policies, or any auth-sensitive surface. See `Docs/review-cadence/audit-prompt-template.md`.

## Workflow (how schema changes ship)

The full ordering is: review → fresh-session audit → dev-apply → smoke-test dev → merge PR → pre-prod backup → prod-apply → smoke-test prod.

```bash
# 1. One-time login (browser flow; token cached in ~/.supabase)
npx supabase login

# 2. Write a new migration locally
npx supabase migration new add_sessions_table
# Creates supabase/migrations/YYYYMMDDHHMMSS_add_sessions_table.sql.
# Edit with forward SQL + a commented DOWN block at the bottom.

# 3. Open a PR with the migration SQL.

# 4. Run a fresh-session Claude Code audit (see Docs/review-cadence/audit-prompt-template.md).

# 5. Address audit findings by pushing more commits to the PR.

# 6. Apply to DEV
npx supabase link --project-ref <dev-ref>
npx supabase db push

# 7. Smoke-test dev: dashboard table editor + a query as authenticated.

# 8. Merge the PR.

# 9. Pre-prod backup (zero data today, but build the habit)
npx supabase db dump --project-ref ypupvssqcunetzjddwoy -f backups/prod-pre-<name>-$(date +%Y%m%d-%H%M).sql

# 10. Apply to PROD
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
