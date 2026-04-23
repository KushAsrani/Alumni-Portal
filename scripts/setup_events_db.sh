#!/usr/bin/env bash
# scripts/setup_events_db.sh
# Run the events MongoDB schema initializer.
# Usage: bash scripts/setup_events_db.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🔧 Initializing Events & Webinars MongoDB collections…"

cd "$REPO_ROOT"

# Prefer .env.local, fall back to .env
if [[ -f .env.local ]]; then
  export $(grep -v '^#' .env.local | xargs)
elif [[ -f .env ]]; then
  export $(grep -v '^#' .env | xargs)
fi

python3 python_api/db/events_schema.py

echo "✅ Done."
