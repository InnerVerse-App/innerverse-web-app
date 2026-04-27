import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";

import { AutoScrollToTarget } from "@/app/_components/AutoScrollToTarget";
import { PageShell } from "@/app/_components/PageShell";
import { StartSessionButton } from "@/app/home/StartSessionButton";
import { startSession } from "@/app/sessions/actions";
import { formatDateShort } from "@/lib/format";
import {
  getOnboardingState,
  isOnboardingComplete,
} from "@/lib/onboarding";
import { supabaseForUser } from "@/lib/supabase";

import {
  buildDemoData,
  DEMO_SESSIONS_LIST,
  snippetFor,
} from "../progress/demo-data";

export const dynamic = "force-dynamic";

type SessionListRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  progress_summary_short: string | null;
};

async function loadSessionHistory(): Promise<SessionListRow[]> {
  const ctx = await supabaseForUser();
  if (!ctx) return [];
  const { data, error } = await ctx.client
    .from("sessions")
    .select("id, started_at, ended_at, summary, progress_summary_short")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data as SessionListRow[] | null) ?? [];
}

function formatDuration(startIso: string, endIso: string): string {
  const ms = Date.parse(endIso) - Date.parse(startIso);
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export default async function SessionsListPage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; session?: string }>;
}) {
  const params = await searchParams;
  const isDemo = params.demo === "1";
  const highlightedSessionId = params.session ?? null;

  if (!isDemo) {
    const session = await auth();
    if (!session?.userId) redirect("/sign-in");

    const onboarding = await getOnboardingState();
    if (!isOnboardingComplete(onboarding)) redirect("/onboarding");
  }

  // Real path stays as the simpler Link-list for now — expandable
  // session detail in real mode requires fetching breakthroughs /
  // shifts / goals per session, queued for the V.5a chunk.
  if (!isDemo) {
    const sessions = await loadSessionHistory();
    return (
      <PageShell active="sessions">
        <h1 className="text-3xl font-bold text-white">Sessions</h1>
        <p className="mt-1 text-sm text-neutral-400">
          A log of your coaching sessions.
        </p>
        {sessions.length === 0 ? (
          <p className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5 text-sm text-neutral-400">
            No sessions yet. Start one from the Home tab.
          </p>
        ) : (
          <ul className="mt-6 flex flex-col gap-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/sessions/${s.id}`}
                  className="block rounded-xl border border-white/10 bg-white/[0.02] p-5 transition hover:border-brand-primary/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-neutral-400">
                      {formatDateShort(s.started_at)}
                    </p>
                    <span
                      className={
                        s.ended_at
                          ? "text-[11px] text-neutral-500"
                          : "text-[11px] text-brand-primary"
                      }
                    >
                      {s.ended_at ? "Completed" : "In progress"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-neutral-200">
                    {s.summary ??
                      s.progress_summary_short ??
                      (s.ended_at
                        ? "Summary pending — analysis may still be running."
                        : "Open session — tap to continue.")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PageShell>
    );
  }

  // ----- demo branch -----

  const demo = buildDemoData();
  const shiftsBySession = new Map<
    string,
    { id: string; content: string }[]
  >();
  for (const m of demo.mindsetShifts) {
    const arr = shiftsBySession.get(m.sessionId) ?? [];
    arr.push({ id: m.id, content: m.content });
    shiftsBySession.set(m.sessionId, arr);
  }
  const breakthroughsBySession = new Map<
    string,
    { id: string; content: string }[]
  >();
  for (const b of demo.breakthroughs) {
    const arr = breakthroughsBySession.get(b.sessionId) ?? [];
    arr.push({ id: b.id, content: b.content });
    breakthroughsBySession.set(b.sessionId, arr);
  }
  // For each session, find which goals it touched by reverse-lookup
  // through goalLinks (any goal whose contributor sessionIds include
  // this session id).
  const goalsBySession = new Map<
    string,
    { id: string; title: string }[]
  >();
  const goalById = new Map(demo.goals.map((g) => [g.id, g] as const));
  for (const [goalId, links] of demo.goalLinks) {
    const g = goalById.get(goalId);
    if (!g) continue;
    for (const sessionId of links.sessionIds) {
      const arr = goalsBySession.get(sessionId) ?? [];
      arr.push({ id: g.id, title: g.title });
      goalsBySession.set(sessionId, arr);
    }
  }

  const sessions = DEMO_SESSIONS_LIST;

  return (
    <PageShell active="sessions" navHrefSuffix="?demo=1">
      <AutoScrollToTarget
        targetId={highlightedSessionId ? `s-${highlightedSessionId}` : null}
      />
      <h1 className="text-3xl font-bold text-white">Sessions</h1>
      <p className="mt-1 text-sm text-neutral-400">
        A log of your coaching sessions.{" "}
        <span className="text-amber-400">(demo mode)</span>
      </p>

      {sessions.length === 0 ? (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <p className="text-sm text-neutral-400">
            No sessions yet. Begin your first coaching session to start
            building your log.
          </p>
          <form action={startSession} className="mt-4">
            <StartSessionButton label="Start Your First Session" />
          </form>
        </div>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {sessions.map((s) => {
            const isHighlighted = highlightedSessionId === s.id;
            const shifts = shiftsBySession.get(s.id) ?? [];
            const breakthroughs = breakthroughsBySession.get(s.id) ?? [];
            const goals = goalsBySession.get(s.id) ?? [];
            const duration = s.ended_at
              ? formatDuration(s.started_at, s.ended_at)
              : null;
            // Brief title for the collapsed view: progress_summary_short
            // is one-line; falls back to the longer summary truncated.
            const briefTitle = s.progress_summary_short ?? s.summary ?? "";
            return (
              <li key={s.id}>
                <details
                  id={`s-${s.id}`}
                  open={isHighlighted || undefined}
                  className={
                    "group scroll-mt-20 rounded-xl border bg-white/[0.02] transition " +
                    (isHighlighted
                      ? "border-brand-primary bg-brand-primary/10 shadow-[0_0_18px_rgba(89,164,192,0.35)]"
                      : "border-white/10")
                  }
                >
                  <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-neutral-400">
                          {formatDateShort(s.started_at)}
                          {duration ? (
                            <span className="text-neutral-500">
                              {" "}
                              · {duration}
                            </span>
                          ) : null}
                        </p>
                        <span
                          className={
                            s.ended_at
                              ? "text-[11px] text-neutral-500"
                              : "text-[11px] text-brand-primary"
                          }
                        >
                          {s.ended_at ? "Completed" : "In progress"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-neutral-200">
                        {briefTitle}
                      </p>
                    </div>
                    <span
                      className="mt-1 inline-block shrink-0 text-neutral-500 transition group-open:rotate-180"
                      aria-hidden
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </span>
                  </summary>
                  <div className="border-t border-white/5 px-5 pb-5 pt-4">
                    <div className="flex flex-col gap-4">
                      {s.summary ? (
                        <p className="text-sm leading-relaxed text-neutral-300">
                          {s.summary}
                        </p>
                      ) : null}

                      {breakthroughs.length > 0 ? (
                        <div>
                          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                            Breakthroughs from this session
                          </p>
                          <ul className="flex flex-col gap-1.5 text-xs">
                            {breakthroughs.map((b) => (
                              <li
                                key={b.id}
                                className="flex items-start gap-2"
                              >
                                <span
                                  className="mt-1 inline-block h-2 w-2 shrink-0"
                                  style={{
                                    background: "#DCA114",
                                    clipPath:
                                      "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)",
                                  }}
                                  aria-hidden
                                />
                                <Link
                                  href={`/progress?demo=1&constellation=${b.id}`}
                                  className="flex-1 text-neutral-200 transition hover:text-brand-primary"
                                >
                                  {b.content}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {shifts.length > 0 ? (
                        <div>
                          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                            Mindset shifts noticed
                          </p>
                          <ul className="flex flex-col gap-1.5 text-xs">
                            {shifts.map((m) => (
                              <li
                                key={m.id}
                                className="flex items-start gap-2"
                              >
                                <span
                                  className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: "#A78BFA" }}
                                  aria-hidden
                                />
                                <div className="flex-1">
                                  <Link
                                    href={`/progress?demo=1&shift=${m.id}`}
                                    className="font-medium text-neutral-200 transition hover:text-brand-primary"
                                  >
                                    {m.content}
                                  </Link>
                                  <p className="mt-0.5 text-neutral-400">
                                    {snippetFor(s.id, m.id, "session")}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {goals.length > 0 ? (
                        <div>
                          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
                            Goals touched
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {goals.map((g) => (
                              <Link
                                key={g.id}
                                href={`/goals?demo=1&goal=${g.id}#g-${g.id}`}
                                className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-[11px] text-neutral-300 transition hover:border-brand-primary/40 hover:text-brand-primary"
                                style={{
                                  borderColor: "rgba(74,222,128,0.4)",
                                  color: "#4ADE80",
                                }}
                              >
                                {g.title}
                              </Link>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      <Link
                        href={`/sessions/${s.id}`}
                        className="mt-2 inline-flex items-center gap-1.5 self-start rounded-md border border-brand-primary/40 bg-brand-primary/10 px-3 py-1.5 text-[11px] font-medium text-brand-primary transition hover:bg-brand-primary/20"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3 w-3"
                          aria-hidden
                        >
                          <path d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                        </svg>
                        View full session
                      </Link>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
