#!/usr/bin/env bash
# InnerVerse SessionStart hook — review-cadence reminder.
#
# Silent when the repo has no unreviewed merges since the last audit.
# Prints a reminder when one or more squash-merged PRs have landed on
# `main` but haven't been reviewed yet.
#
# State file: .claude/.last-audited-sha (gitignored).
# The state is stored relative to the main repo dir (not a worktree's
# .git/) so a single audit decision applies across worktrees.

set -eu

# Find the main repo dir. Exits silently if we're not in a git repo.
GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 0
MAIN_REPO_DIR="$(cd "$(dirname "$GIT_COMMON_DIR")" && pwd)"
STATE_FILE="$MAIN_REPO_DIR/.claude/.last-audited-sha"

# Find current HEAD of `main`. Exits silently if `main` doesn't exist.
CURRENT_SHA="$(git -C "$MAIN_REPO_DIR" rev-parse main 2>/dev/null)" || exit 0

# First run: seed state silently and exit.
if [ ! -f "$STATE_FILE" ]; then
  mkdir -p "$(dirname "$STATE_FILE")"
  printf '%s\n' "$CURRENT_SHA" > "$STATE_FILE"
  exit 0
fi

STORED_SHA="$(tr -d '[:space:]' < "$STATE_FILE")"

# Up-to-date: stay silent.
if [ "$STORED_SHA" = "$CURRENT_SHA" ]; then
  exit 0
fi

# Count merged PRs between stored and current by looking for the
# GitHub squash-merge subject format: subject ends in " (#NNN)".
# If this repo's merge convention changes, update the regex here.
PENDING_PRS="$(git -C "$MAIN_REPO_DIR" log \
  --pretty=format:'%h %s' \
  "${STORED_SHA}..${CURRENT_SHA}" 2>/dev/null \
  | grep -E ' \(#[0-9]+\)$' || true)"

if [ -z "$PENDING_PRS" ]; then
  exit 0
fi

PENDING_COUNT="$(printf '%s\n' "$PENDING_PRS" | wc -l | tr -d ' ')"
SHORT_STORED="$(printf '%s' "$STORED_SHA" | cut -c1-7)"
SHORT_CURRENT="$(printf '%s' "$CURRENT_SHA" | cut -c1-7)"

cat <<EOF
────────────────────────────────────────────────────────────────────
InnerVerse review-cadence reminder

$PENDING_COUNT merge(s) on main haven't been reviewed since the last
audit.

Scope: ${SHORT_STORED}..${SHORT_CURRENT}

Pending PRs:
$PENDING_PRS

Recommended next steps:
  1. Run \`/simplify\` on each merged chunk before starting new work.
  2. At the next milestone gate (see CLAUDE.md § Review cadence),
     run a fresh-session audit using
     Docs/review-cadence/audit-prompt-template.md
  3. After the audit completes, record the new HEAD SHA by running:
       echo "$CURRENT_SHA" > .claude/.last-audited-sha

AI review catches a lot, but not everything. Real-user telemetry
remains ground truth.
────────────────────────────────────────────────────────────────────
EOF

exit 0
