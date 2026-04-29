# Multi-language plan (pre-plan notes)

Starting point for adding non-English language support. Captured
during a planning conversation on 2026-04-29. **Not yet implemented**
— this is the architectural sketch we'll build from when we're ready
to start.

## Decisions locked in

- **Per-user language, picked at onboarding, immutable afterward.**
  No mid-account language switching. Eliminates the "what happens to
  my old sessions in language A when I switch to B" problem.
- **Separate prompt files per language**, not a single prompt with a
  `respond_in_language` parameter. We want to tune coaching nuance in
  each language directly.
- **Pre-translated, not real-time.** Nothing is translated on the fly
  at request time. Everything is a translated artifact committed to
  the repo (or seeded into the DB as parallel rows).
- **Start with one additional language first.** Validate the pipeline
  before committing to more.

## Architecture — four layers

| Layer | Where it lives | Per-language strategy |
|---|---|---|
| UI strings | `messages/<locale>.json` in the repo, bundled at build | Pre-translated JSON files; `next-intl` (or equivalent) selects by user's language |
| Coaching prompts | `reference/prompt-*-<locale>.md` | Translated sibling files; server reads the right one based on user's language |
| Catalog data (themes, predefined goals, coach personas) | DB rows with a `language` column | Parallel rows seeded via migration; lookups filter by user's language |
| User-generated content (session summaries, narratives, breakthroughs) | DB, written by the AI | Written once in user's chosen language, never duplicated, never translated |

## Translation pipeline

What's automatable vs not:

- **Automatable**: UI strings, catalog rows, prompt files. A Node
  script + Claude API call diffs English source vs translated siblings,
  regenerates anything stale, opens follow-up PRs per locale.
- **Not automatable**: validating that coaching tone, idiom, and
  calibration intensity actually feel right in the target language.
  That's a native-speaker review job.

Realistic workflow:

1. **English is the canonical source.** Always edit English first.
2. **Translation script** triggers on PRs that touch translatable
   files. Generates language sibling files via Claude with explicit
   instructions: preserve JSON schemas exactly, keep coaching tone
   warm but grounded, translate examples to natural phrasing in
   target language.
3. **Per-language fixture suite**: a few known-good session
   transcripts each language must produce sane output for. Catches
   gross regressions (model refused, JSON malformed, theme labels
   mistranslated). Same idea as the existing pre-launch fixture
   runner, just multiplied by language.
4. **Native-speaker sanity check** before merging anything that
   touches coaching nuance. UI-string updates can probably auto-merge
   once a language is stable; prompt updates need human eyes
   indefinitely.

## Database changes (sketch)

- `users.language` column (e.g., `text not null default 'en'`).
  Enforce immutability at the API boundary — server actions must
  ignore writes to this column post-onboarding.
- `themes.language` column. Seed parallel rows via migration. Update
  the session-end RPC's theme-lookup to filter by user's language.
- Predefined-goals catalog: same treatment.
- Coach personas (`src/app/onboarding/data.ts`): if we keep them in
  code, add per-language variants; if we move them to the DB,
  same `language` column pattern.
- Sentry tag: `user.language` so we can see quality regressions in
  one language without noise from the others.

## Ongoing maintenance cost

- **Mechanical updates** (UI string, catalog rows, prompt rephrasings):
  near-zero marginal cost per language thanks to the auto-translation
  pipeline.
- **Substantive prompt iterations** (v6→v7-style overhauls): linear in
  the number of languages. ~30 min of native-speaker review per
  language per substantive update, indefinitely. We've iterated v5→v7
  plus added the growth narrative pipeline in just a few weeks — at 2
  languages, that's 2x review work; at 5, it's 5x.

## Open questions to settle when we start

1. Which language to start with? (Spanish? French? German?)
2. Build the i18n scaffolding before the next major prompt iteration
   (so the next prompt version is born multilingual) or retrofit
   afterward?
3. Native-speaker reviewer source — friend, contractor, paid translation
   service with coaching domain knowledge?
4. Locale routing strategy — `/es/home` URL prefix vs cookie-driven
   single-domain? URL prefix is more conventional and SEO-friendlier;
   cookie-driven is simpler since the language is per-account anyway
   and we don't need public per-language landing pages.
5. Do we want to support a language even if our coach personas don't
   fit it culturally? (Some persona archetypes — "the old wise one",
   "the cool kid" — translate awkwardly across cultures.)

## Related ledger entry

When we start, this becomes its own milestone in the build plan with
a fresh-session audit gate before launching language #2 to real users.
