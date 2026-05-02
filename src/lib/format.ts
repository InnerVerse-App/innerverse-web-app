// Shared date / time formatters. Kept in one place so a future
// locale or timezone change lands with one edit.

export function formatDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// "Apr 21" — no year. Used in list rows where the full date is
// noise.
export function formatDateCompact(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// "10:32 AM" — used in the chat transcript.
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// "May 2, 2026 at 7:14 AM" — used on journal-entry headers.
export function formatDateTimeLong(iso: string): string {
  return `${formatDateLong(iso)} at ${formatTime(iso)}`;
}

// "May 2, 7:14 AM" — used on tighter journal-entry rows.
export function formatDateTimeCompact(iso: string): string {
  return `${formatDateCompact(iso)}, ${formatTime(iso)}`;
}
