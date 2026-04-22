"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// App-Router top-level error boundary. Next.js renders this when an
// uncaught error escapes every other boundary (including the root
// layout). Sentry needs an explicit capture here — without this file,
// React render errors never reach Sentry in App Router. Recommended
// wiring per https://docs.sentry.io/platforms/javascript/guides/nextjs.

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <h1>Something went wrong</h1>
        <p>We&apos;ve been notified. Please try again in a moment.</p>
      </body>
    </html>
  );
}
