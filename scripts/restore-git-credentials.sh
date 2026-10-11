#!/usr/bin/env bash
# Restores GitHub git credentials from the persistent PAT file.
# Primary location: .secrets/github-pat.txt (chmod 600, git-ignored).
# Fallback: ~/.secrets/github-pat.txt (survives workspace file-loss — the
# sandbox has repeatedly dropped files inside the project dir, PS-016).
# Run this if pushes start failing with 401/Bad credentials (env reset).
set -euo pipefail

PAT_FILE="$(dirname "$0")/../.secrets/github-pat.txt"
FALLBACK_FILE="$HOME/.secrets/github-pat.txt"
CRED_FILE="$HOME/.git-credentials"

if [[ ! -f "$PAT_FILE" && -f "$FALLBACK_FILE" ]]; then
  mkdir -p "$(dirname "$PAT_FILE")"
  cp "$FALLBACK_FILE" "$PAT_FILE"
  chmod 600 "$PAT_FILE"
  echo "Restored .secrets/github-pat.txt from home-dir fallback."
fi

if [[ ! -f "$PAT_FILE" ]]; then
  echo "ERROR: $PAT_FILE not found (and no fallback at $FALLBACK_FILE)" >&2
  exit 1
fi

PAT=$(tr -d '[:space:]' < "$PAT_FILE")
printf 'https://kuttappu507:%s@github.com\n' "$PAT" > "$CRED_FILE"
chmod 600 "$CRED_FILE"
git config --global credential.helper store

HTTP=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $PAT" https://api.github.com/user)
if [[ "$HTTP" == "200" ]]; then
  echo "Credentials restored & verified (HTTP $HTTP)."
else
  echo "WARNING: token check returned HTTP $HTTP — PAT may be expired/revoked." >&2
  exit 2
fi
