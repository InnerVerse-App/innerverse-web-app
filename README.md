# InnerVerse Web App

A Next.js rebuild of the InnerVerse iOS (Bubble) app, shipping first to Android testers as a PWA and progressively replacing Bubble.

The coaching product: the user runs a 6-step onboarding, then has AI-coached text sessions. Each session ends with reflection + feedback, and the backend post-processes the transcript into a summary, breakthroughs, insights, next steps, and goal-progress updates that feed back into the next session.

## Source of truth

All design and scope decisions live in [`reference/decisions.md`](reference/decisions.md). If something in this README and `decisions.md` disagree, `decisions.md` wins.

Additional reference material lives under `reference/`:

- Live prompts embed their pinned model in the filename (e.g., `prompt-X-gpt-5.2.md`). When you change the model in `src/lib/openai.ts`, rename the file to match.
  - `prompt-session-opener-gpt-5-mini.md` — focus-aware opening rules; governs the coach's first message only.
  - `prompt-v11.4-gpt-5.4.md` — master coaching prompt (operator-authored); governs every turn after the opener, sent verbatim.
  - `prompt-session-end-v7-gpt-5.2.md` — session-end analysis prompt (returns structured JSON).
  - `prompt-session-response-v2-gpt-5-mini.md` — post-session reflection parser.
  - `prompt-growth-narrative-v1-gpt-5.md` — cumulative "Message from your Coach" letter.
  - `prompt-style-calibration-v1-gpt-5-mini.md` — feedback-driven style calibration aggregator.
- `archive/` — superseded prompts (prompt-coaching-chat.md, session-end v5/v6, session-response v1, prompt-v11.3-gpt-5.2.md) kept for diff/reference, not loaded by any live code.
- `app-data-export.json` — privacy policy, terms, and legacy Bubble config.
- `screenshots/` — UI, data-type, backend-workflow, API-connector, and Figma references.

## Tech stack

- **Next.js 15** (App Router, TypeScript)
- **React 18**
- **Tailwind CSS 3**
- **Clerk** for auth (magic-link)
- **Supabase** (Postgres + RLS) for data
- **OpenAI** `/v1/responses` for the coach (gpt-5 for start/end, gpt-5.2 for chat)
- **Sentry** for error tracking
- **Vercel** for hosting

## Local development

```bash
npm install
cp .env.example .env.local   # then fill in real keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` — production build
- `npm start` — run the production build
- `npm run lint` — ESLint

## Build philosophy

Boring, standard approaches. Small chunks testable in five minutes. `git` from day one. Use managed services rather than custom code wherever possible. See `reference/decisions.md` for the full list.
