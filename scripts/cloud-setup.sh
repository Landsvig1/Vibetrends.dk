#!/usr/bin/env bash
# Setup script for the `vibetrends` Claude Code cloud environment.
# Docs: https://code.claude.com/docs/en/cloud-environments
#
# Paste this file into the environment's "Setup script" box, or run it by hand
# in a session with `bash scripts/cloud-setup.sh`.
#
# Goal: after this, `npm run typecheck`, `npm run lint` and `npm run test:unit`
# pass with NO secrets and NO .env.local. It never needs DATABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY or any bot credential. E2E stays in GitHub CI (its
# seeder writes to the live DB), so Playwright browsers are opt-in only.
#
# Idempotent: re-running with an unchanged package-lock.json and Node version
# skips the install. Exits non-zero if the install or the Node check fails.
# Keep total runtime well under 5 minutes or the environment cache is not built.
#
# Opt-in: VT_INSTALL_PLAYWRIGHT=1 also downloads Chromium for Playwright.

set -euo pipefail

log() { printf '[cloud-setup] %s\n' "$*"; }

# Locate the repo root. The setup box may run this from a temp file, so do not
# trust $0 alone: prefer the project dir, then the cwd, then the script's own
# location.
is_repo() { [ -f "$1/package.json" ] && [ -f "$1/package-lock.json" ]; }

ROOT=""
for candidate in \
  "${CLAUDE_PROJECT_DIR:-}" \
  "$(git rev-parse --show-toplevel 2>/dev/null || true)" \
  "$PWD" \
  "$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." 2>/dev/null && pwd || true)"; do
  if [ -n "$candidate" ] && is_repo "$candidate"; then
    ROOT="$candidate"
    break
  fi
done

if [ -z "$ROOT" ]; then
  if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then
    # Setup box ran before the clone landed. Do not fail the session start:
    # the session can run `bash scripts/cloud-setup.sh` itself.
    log "repo not found yet; skipping. Run 'bash scripts/cloud-setup.sh' in the session."
    exit 0
  fi
  log "ERROR: could not find the repo root (package.json + package-lock.json)."
  exit 1
fi
cd "$ROOT"
log "repo: $ROOT"

# Node: CI pins 24. Cloud VMs ship 20, 21 and 22 (22 on PATH). Next 16 and
# vitest 4 need >= 20.19; scripts use --env-file-if-exists (>= 22.9). Prefer the
# newest preinstalled Node if the default is older than 22.
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 22 ]; then
  for dir in /opt/node24 /opt/node22; do
    if [ -x "$dir/bin/node" ]; then
      export PATH="$dir/bin:$PATH"
      break
    fi
  done
fi
if [ "$(node_major)" -lt 22 ]; then
  log "ERROR: Node >= 22 required, found $(node -v 2>/dev/null || echo none)."
  exit 1
fi
log "node $(node -v), npm $(npm -v)"

export CI=true
export NEXT_TELEMETRY_DISABLED=1
export npm_config_audit=false
export npm_config_fund=false
export npm_config_update_notifier=false

# Install only when the lockfile or Node version changed (or node_modules is gone).
hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$@"; else shasum -a 256 "$@"; fi
}
STAMP="node_modules/.cloud-setup.sha256"
WANT="$( { hash_file package-lock.json; node -v; } | hash_file | cut -d' ' -f1)"

if [ -d node_modules ] && [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$WANT" ]; then
  log "dependencies up to date, skipping npm ci"
else
  rm -f "$STAMP"
  log "npm ci"
  npm ci
  printf '%s\n' "$WANT" > "$STAMP"
fi

if [ "${VT_INSTALL_PLAYWRIGHT:-0}" = "1" ]; then
  # Optional and non-fatal. E2E runs in GitHub CI, not here.
  log "installing Playwright chromium (opt-in)"
  npx playwright install chromium || log "playwright install failed, continuing"
fi

log "done"
