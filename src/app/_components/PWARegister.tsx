"use client";

import { useEffect } from "react";

// Registers the InnerVerse service worker on first load. Without a
// registered SW that has a fetch handler, modern browsers won't
// surface the "Install app" prompt — see public/sw.js for the
// reasoning. The SW itself does nothing interesting; its presence
// is what flips the installability bit.
export function PWARegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = (): void => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("PWARegister: service worker registration failed", err);
      });
    };

    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
