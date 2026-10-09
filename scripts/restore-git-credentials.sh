#!/usr/bin/env bash
# Restores GitHub git credentials from the persistent PAT file.
# The PAT is stored at .secrets/github-pat.txt (chmod 600, git-ignored).
# Run this if pushes start failing with 401/Bad credentials (env reset).
set -euo pipefail

PAT_FILE="$(dirname "$0")/../.secrets/github-pat.txt"
CRED_FILE="$HOME/.git-credentials"

if [[ ! -f "$PAT_FILE" ]]; then
  echo "ERROR: $PAT_FILE not found" >&2
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
