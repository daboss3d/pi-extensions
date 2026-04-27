#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BASE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEV_DIR="$BASE_DIR/dev"
SELECTED_FILE="$DEV_DIR/.selected"
EPI_SCRIPT="$SCRIPT_DIR/epi/epi"

# ─── Step 1: Run extension picker ─────────────────────────────────
if [[ ! -f "$EPI_SCRIPT" ]]; then
  echo "❌ Extension picker not found at $EPI_SCRIPT"
  exit 1
fi

echo "🔧 Launching extension picker..."
echo ""
"$EPI_SCRIPT"
echo ""

# ─── Step 2: Read selected extensions ──────────────────────────────
if [[ ! -f "$SELECTED_FILE" ]]; then
  echo "⚠️  No extensions selected. Launching pi without extensions."
  exec pi "$@"
fi

EXTENSIONS=()
while IFS= read -r line; do
  line="$(echo "$line" | xargs)" # trim whitespace
  [[ -z "$line" ]] && continue
  EXTENSIONS+=("-e" "$DEV_DIR/$line")
done <"$SELECTED_FILE"

if [[ ${#EXTENSIONS[@]} -eq 0 ]]; then
  echo "⚠️  No extensions selected. Launching pi without extensions."
  exec pi "$@"
fi

# ─── Step 3: Launch pi with selected extensions ────────────────────
NUM_EXT=$(( ${#EXTENSIONS[@]} / 2 ))
echo "🚀 Launching pi with ${NUM_EXT} extension(s):"
for ((i=1; i<${#EXTENSIONS[@]}; i+=2)); do
  echo "  ${EXTENSIONS[$i]}"
done
echo ""

exec pi "${EXTENSIONS[@]}" "$@"
