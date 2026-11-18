#!/bin/bash
#
# micro-e2e: run end-to-end tests with the app windows VISIBLE, to show
# someone what the tests do. The normal runs (npm run e2e) stay in the
# background; this script changes nothing for them, it only sets the
# watch switches for its own run.
#
#   micro-e2e                the short playlist (invite + edit, chat, stitcher)
#   micro-e2e 20-            scenarios whose file name matches (several allowed)
#   micro-e2e --slow         longer pause after each step (3 s instead of 1.2 s)
#   micro-e2e --fast         visible windows at full test speed, no captions
#   micro-e2e --list         the scenarios there are
#
# Anything after "--" goes to Playwright as it is (for example -- -g "chat").
#
# Install (once):  ln -s <repo>/scripts/micro-e2e.sh ~/.local/bin/micro-e2e
# Needs the dev Docker stack; no "npm run dev" session may be running.

set -u

REPO="$(cd "$(dirname "$(realpath "$0")")/.." && pwd)"
SCENARIOS="$REPO/tests/e2e/scenarios"

# The playlist: one test from each of three scenarios (by test title)
PLAYLIST_FILES=(01- 12- 43-)
PLAYLIST_TITLES='invite an editor while their app is open|two members chat in the chat window|Image Stitcher: move, snap, nudge'

mode=watch
pause_ms=''
filters=()
extra=()

usage() { sed -n '3,17p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0 ;;
    --list) ls "$SCENARIOS" | sed 's/\.spec\.ts$//'; exit 0 ;;
    --fast) mode=show ;;
    --slow) pause_ms=3000 ;;
    --) shift; extra=("$@"); break ;;
    -*) echo "micro-e2e: unknown option $1 (try --help)" >&2; exit 2 ;;
    *) filters+=("$1") ;;
  esac
  shift
done

stop() { echo "micro-e2e: $1" >&2; exit 1; }

[ -d "$SCENARIOS" ] || stop "the StraboMicro2 folder was not found at $REPO (is the disk connected?)"

# A filter that matches no scenario would make Playwright run nothing
for f in ${filters[@]+"${filters[@]}"}; do
  ls "$SCENARIOS" | grep -q -- "$f" || stop "no scenario matches \"$f\" (micro-e2e --list shows them)"
done

command -v docker >/dev/null || stop "docker was not found"
names="$(docker ps --format '{{.Names}}' 2>/dev/null)" || stop "Docker is not running. Start Docker Desktop, wait for the dev stack, then try again."
for c in strabo-php strabo-postgres; do
  echo "$names" | grep -qx "$c" || stop "the dev Docker stack is not running (container $c is missing)"
done

# The tests reuse whatever serves port 5173; a dev session's Vite leaves the
# test copies on an empty window
if lsof -nP -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
  stop "something is already using port 5173, most likely \"npm run dev\". Stop it first, then try again."
fi

cd "$REPO" || stop "cannot open $REPO"

args=()
if [ ${#filters[@]} -gt 0 ]; then
  args=("${filters[@]}")
  what="scenarios matching: ${filters[*]}"
else
  args=("${PLAYLIST_FILES[@]}" -g "$PLAYLIST_TITLES")
  what="the playlist: invite and edit, chat, Image Stitcher"
fi

if [ "$mode" = watch ]; then
  export E2E_WATCH=1
  [ -n "$pause_ms" ] && export E2E_PAUSE_MS="$pause_ms"
  how="windows side by side, a caption for each step"
else
  export E2E_SHOW=1
  how="visible windows at full speed"
fi

echo "micro-e2e: $what"
echo "           $how"
echo "           Do not add micrographs in another StraboMicro copy while this runs."
echo

npx playwright test -c tests/e2e/playwright.config.ts "${args[@]}" ${extra[@]+"${extra[@]}"}
status=$?

echo
if [ $status -eq 0 ]; then
  echo "micro-e2e: all passed."
else
  echo "micro-e2e: something failed. The report: cd \"$REPO\" && npm run e2e:report"
fi
exit $status
