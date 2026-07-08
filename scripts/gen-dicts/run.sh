#!/usr/bin/env bash
# Regenerate lib/dicts/generated/*.ts from local toolchains.
# Missing toolchains (or not-yet-written extractors) are skipped with a warning;
# already-committed generated files for skipped languages are left untouched.
set -uo pipefail
cd "$(dirname "$0")/../.."

RAW="$(mktemp -d)"
trap 'rm -rf "$RAW"' EXIT
GD=scripts/gen-dicts
AL=$GD/allowlists
ok=0

if [ -f "$GD/python/extract.py" ]; then
  if command -v python3 >/dev/null; then
    python3 "$GD/python/extract.py" "$AL/python.json" "$RAW/python.raw.json" && ok=1
  else
    echo "WARN: python3 not found - skipping Python dictionary" >&2
  fi
fi

if [ -f "$GD/ts/extract.mjs" ]; then
  node "$GD/ts/extract.mjs" "$AL/javascript.json" "$RAW/javascript.raw.json" && ok=1
fi

if [ -f "$GD/java/Extract.java" ]; then
  if command -v java >/dev/null; then
    node -e "console.log(require('./$AL/java.json').map(e => e.class + ' ' + e.recv).join('\n'))" > "$RAW/java.allow"
    java "$GD/java/Extract.java" "$RAW/java.allow" "$RAW/java.raw.json" && ok=1
  else
    echo "WARN: java not found - skipping Java dictionary" >&2
  fi
fi

if [ -f "$GD/go/extract.go" ]; then
  if command -v go >/dev/null; then
    go run "$GD/go/extract.go" "$AL/go.json" "$RAW/go.raw.json" && ok=1
  else
    echo "WARN: go not found - skipping Go dictionary" >&2
  fi
fi

if [ "$ok" = 0 ]; then
  echo "ERROR: no extractor produced output" >&2
  exit 1
fi
node "$GD/emit.mjs" "$RAW"
