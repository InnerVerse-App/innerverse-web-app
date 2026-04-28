"use client";

import { useEffect } from "react";

// On page mount, finds the element with the given id and scrolls
// it into view such that as much of its (expanded) content as
// possible is visible — centered when it fits in the available
// viewport, top-aligned when it's taller. Used on Progress / Goals
// / Sessions to land the user on a fully-visible expanded card
// when they arrived via a highlight URL param (?constellation=,
// ?shift=, ?goal=, ?session=).
//
// Only scrolls when the URL hash matches the target id (e.g. URL
// `?constellation=X#bt-X` with targetId=`bt-X`). This is the signal
// that the user navigated TO that card from elsewhere (a session
// pill links with the hash). Clicking a dot on the same /progress
// page sets the query param without a matching hash, so we don't
// re-scroll for in-page selection.
//
// Delay before scrolling: gives in-page animations (e.g. the
// constellation auto-zoom on /progress) time to settle so the
// scroll runs from a stable layout.

type Props = {
  targetId: string | null;
  delayMs?: number;
};

export function AutoScrollToTarget({ targetId, delayMs = 600 }: Props) {
  useEffect(() => {
    if (!targetId) return;
    if (typeof window === "undefined") return;
    if (window.location.hash !== `#${targetId}`) return;
    const t = setTimeout(() => {
      const el = document.getElementById(targetId);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      // Reserve room for any fixed page chrome — the bottom nav is
      // ~80px, the page padding plus optional sticky header is ~80px.
      const safeTop = 80;
      const safeBottom = 80;
      const availableHeight = Math.max(0, viewportHeight - safeTop - safeBottom);
      let targetTop: number;
      if (rect.height <= availableHeight) {
        // Fits — center within the available area.
        targetTop = safeTop + (availableHeight - rect.height) / 2;
      } else {
        // Taller than the available area — show the top so the user
        // sees the summary first.
        targetTop = safeTop;
      }
      const delta = rect.top - targetTop;
      if (Math.abs(delta) < 4) return; // already in place
      window.scrollBy({ top: delta, behavior: "smooth" });
    }, delayMs);
    return () => clearTimeout(t);
  }, [targetId, delayMs]);
  return null;
}
