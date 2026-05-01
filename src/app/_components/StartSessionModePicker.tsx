"use client";

// Shared mode picker shown right before a session starts. Two options:
//   "Type"  → opens session in text mode (textarea + send button)
//   "Talk"  → opens session in voice mode (push-to-talk + TTS reply)
//
// The picker is rendered inline (not a true modal) by the various
// session-start surfaces — StartSessionMenu on Home / Sessions, the
// per-goal start button on Goals — and reuses the same look as the
// rest of the start flow's panels. Once the user makes a choice the
// host component is responsible for actually firing startSession()
// with focus_mode set.
type Props = {
  onSelect: (mode: "text" | "voice") => void;
  onBack: () => void;
  // When true, hides the Cancel/back link. Useful for hosts that
  // already manage their own dismiss UX (e.g. inline mode picker on
  // a goal card that has its own Close button).
  hideBack?: boolean;
};

export function StartSessionModePicker({ onSelect, onBack, hideBack }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 text-xs uppercase tracking-wide text-neutral-500">
        How do you want to talk with your coach?
      </p>
      <ModeButton
        label="Type"
        sublabel="Send messages back and forth."
        onClick={() => onSelect("text")}
      />
      <ModeButton
        label="Talk"
        sublabel="Speak out loud — your coach speaks back."
        onClick={() => onSelect("voice")}
      />
      {hideBack ? null : (
        <button
          type="button"
          onClick={onBack}
          className="mt-1 self-center rounded px-3 py-1 text-xs text-neutral-400 transition hover:text-white"
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function ModeButton({
  label,
  sublabel,
  onClick,
}: {
  label: string;
  sublabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full flex-col items-start rounded-md border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition hover:border-brand-primary/40 hover:bg-white/[0.05]"
    >
      <span className="text-sm font-medium text-white">{label}</span>
      <span className="text-xs text-neutral-400">{sublabel}</span>
    </button>
  );
}
