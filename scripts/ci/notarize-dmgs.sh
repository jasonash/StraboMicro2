#!/usr/bin/env bash
# Notarize and staple every DMG in a directory.
#
# Usage: notarize-dmgs.sh [dir]   (default: release)
# Env:   APPLE_ID, APPLE_ID_PASSWORD, APPLE_TEAM_ID
#
# Submits without --wait and polls the submission id instead. `notarytool submit
# --wait` fails the whole build when a single status poll times out, even though
# the upload succeeded and Apple is still processing (v2.0.43, 2026-08-27:
# NSURLErrorDomain -1001 after a successful upload). Polling tolerates that.

set -uo pipefail

DIR="${1:-release}"
: "${APPLE_ID:?APPLE_ID required}"
: "${APPLE_ID_PASSWORD:?APPLE_ID_PASSWORD required}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID required}"

CREDS=(--apple-id "$APPLE_ID" --password "$APPLE_ID_PASSWORD" --team-id "$APPLE_TEAM_ID")

SUBMIT_ATTEMPTS=3
POLL_INTERVAL=30
POLL_LIMIT=120   # 120 x 30s = 60 minutes

submit() {
  local dmg="$1" attempt out id
  for attempt in $(seq 1 "$SUBMIT_ATTEMPTS"); do
    echo "Submitting $dmg (attempt $attempt/$SUBMIT_ATTEMPTS)..." >&2
    if out=$(xcrun notarytool submit "$dmg" "${CREDS[@]}" --no-wait --output-format json); then
      id=$(echo "$out" | jq -r '.id // empty')
      if [ -n "$id" ]; then
        echo "$id"
        return 0
      fi
    fi
    echo "  Submit failed: $out" >&2
    sleep 30
  done
  return 1
}

wait_for() {
  local id="$1" i out status
  for i in $(seq 1 "$POLL_LIMIT"); do
    # A failed poll is not a failed notarization, just ask again
    if out=$(xcrun notarytool info "$id" "${CREDS[@]}" --output-format json 2>&1); then
      status=$(echo "$out" | jq -r '.status // empty')
      echo "  [$i/$POLL_LIMIT] status: ${status:-unknown}"
      case "$status" in
        Accepted) return 0 ;;
        Invalid|Rejected)
          xcrun notarytool log "$id" "${CREDS[@]}" || true
          return 1 ;;
      esac
    else
      echo "  [$i/$POLL_LIMIT] status poll failed, will retry: $out"
    fi
    sleep "$POLL_INTERVAL"
  done
  echo "Timed out waiting for notarization of submission $id"
  return 1
}

staple() {
  local dmg="$1" attempt
  for attempt in 1 2 3; do
    xcrun stapler staple "$dmg" && return 0
    echo "  Staple failed (attempt $attempt/3), retrying..."
    sleep 20
  done
  return 1
}

shopt -s nullglob
DMGS=("$DIR"/*.dmg)
if [ "${#DMGS[@]}" -eq 0 ]; then
  echo "Error: no DMG files in $DIR"
  exit 1
fi

for DMG in "${DMGS[@]}"; do
  echo "Notarizing $DMG..."
  ID=$(submit "$DMG") || { echo "Error: could not submit $DMG"; exit 1; }
  echo "Submission id: $ID"
  wait_for "$ID" || { echo "Error: notarization failed for $DMG"; exit 1; }
  staple "$DMG" || { echo "Error: could not staple $DMG"; exit 1; }
done

echo "Notarized and stapled ${#DMGS[@]} DMG(s)"
