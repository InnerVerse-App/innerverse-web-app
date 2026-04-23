"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";

import { BackArrowIcon } from "@/app/_components/icons";
import { formatTime } from "@/lib/format";
import { endSession } from "../actions";

type Message = {
  id: string;
  fromAi: boolean;
  content: string;
  createdAt: string;
};

type Props = {
  sessionId: string;
  coachName: string;
  ended: boolean;
  initialMessages: Message[];
};

export function ChatView({
  sessionId,
  coachName,
  ended,
  initialMessages,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Holds the in-flight stream's AbortController so component unmount
  // (user navigates away) cancels the fetch, which propagates through
  // to cancel the upstream OpenAI call on the server.
  const streamAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // `behavior: "auto"` because this effect fires on every streamed
    // delta during a turn — smooth-scrolling 500 times for a 500-token
    // response causes visible jank.
    bottomRef.current?.scrollIntoView({ behavior: "auto" });
  }, [messages]);

  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    const content = input.trim();
    if (!content || streaming || ended) return;

    setError(null);
    setInput("");

    const userMsg: Message = {
      id: `local-user-${Date.now()}`,
      fromAi: false,
      content,
      createdAt: new Date().toISOString(),
    };
    const aiMsgId = `local-ai-${Date.now()}`;
    const aiStub: Message = {
      id: aiMsgId,
      fromAi: true,
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg, aiStub]);
    setStreaming(true);

    const controller = new AbortController();
    streamAbortRef.current = controller;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiMsgId ? { ...m, content: m.content + chunk } : m,
          ),
        );
      }
    } catch (err) {
      // Abort on unmount is the intended cancel path — not an error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error("ChatView: send failed", err);
      setError("Something went wrong. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== aiMsgId));
    } finally {
      if (streamAbortRef.current === controller) {
        streamAbortRef.current = null;
      }
      setStreaming(false);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(e as unknown as FormEvent);
    }
  }

  async function onEnd() {
    if (endingSession) return;
    setEndingSession(true);
    try {
      await endSession(sessionId);
    } catch (err) {
      console.error("ChatView: endSession failed", err);
      setError("Couldn't end the session. Try again.");
      setEndingSession(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-brand-dark text-neutral-200">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-brand-dark px-4 py-3">
        <Link
          href="/home"
          aria-label="Back"
          className="rounded-md p-1 text-neutral-400 transition hover:bg-white/5 hover:text-white"
        >
          <BackArrowIcon className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-base font-semibold text-white">Coaching Session</h1>
          <p className="text-xs text-neutral-400">Coach {coachName}</p>
        </div>
        <button
          type="button"
          onClick={onEnd}
          disabled={ended || endingSession}
          className="flex items-center gap-1.5 rounded-md border border-brand-primary/40 px-3 py-1.5 text-sm font-medium text-brand-primary transition hover:bg-brand-primary/10 disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M20 6L9 17l-5-5" />
          </svg>
          {endingSession ? "Ending…" : "End"}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          <div ref={bottomRef} />
        </div>
      </main>

      <form
        onSubmit={send}
        className="sticky bottom-0 border-t border-white/10 bg-brand-dark px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={streaming || ended}
            placeholder={ended ? "Session ended" : "Type here…"}
            rows={1}
            className="flex-1 resize-none rounded-full border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-brand-primary disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={streaming || ended || !input.trim()}
            className="rounded-full bg-brand-primary p-2.5 text-brand-primary-contrast transition hover:bg-brand-primary/90 disabled:opacity-50"
            aria-label="Send"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden
            >
              <path d="M22 2L11 13" />
              <path d="M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </div>
        {error ? (
          <p className="mx-auto mt-2 max-w-2xl text-xs text-red-400">{error}</p>
        ) : null}
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const fromAi = message.fromAi;
  return (
    <div className={fromAi ? "self-start" : "self-end"}>
      <div
        className={
          fromAi
            ? "max-w-[80%] rounded-2xl bg-white/5 px-4 py-2.5 text-sm text-neutral-100"
            : "max-w-[80%] rounded-2xl bg-transparent px-4 py-2.5 text-sm text-neutral-200"
        }
      >
        {message.content}
      </div>
      <p
        className={
          fromAi
            ? "mt-1 pl-2 text-xs text-neutral-500"
            : "mt-1 pr-2 text-right text-xs text-neutral-500"
        }
      >
        {formatTime(message.createdAt)}
      </p>
    </div>
  );
}
