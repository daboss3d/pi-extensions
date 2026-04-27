#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
EPI_SCRIPT="$SCRIPT_DIR/ppi/ppi.tsx"

if [[ ! -f "$EPI_SCRIPT" ]]; then
  echo "❌ Package picker not found at $EPI_SCRIPT"
  exit 1
fi

echo "📦 Selecting packages from pi-extensions..."
echo ""
bun "$EPI_SCRIPT"
