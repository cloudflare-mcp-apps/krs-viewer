#!/bin/bash
#
# Cleanup Legacy Files Script
# Removes empty and duplicate files from the skeleton after refactoring
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "🧹 Cleaning up legacy files..."

# Array of files to remove
FILES_TO_REMOVE=(
  "src/shared/logging.ts"
  "src/shared/ai-gateway.ts"
  "src/tool-descriptions.ts"
  "src/tools/example-tool.ts"
  "src/tools/example.ts"
)

# Remove each file if it exists
for file in "${FILES_TO_REMOVE[@]}"; do
  if [ -f "$file" ]; then
    rm -f "$file"
    echo "✅ Removed: $file"
  else
    echo "⏭️  Already removed: $file"
  fi
done

echo ""
echo "✨ Cleanup complete!"
echo ""
echo "Remaining files in src/shared/:"
ls -la src/shared/