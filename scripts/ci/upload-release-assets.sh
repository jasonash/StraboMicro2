#!/usr/bin/env bash
# Upload release assets to an existing GitHub release (normally a draft), one
# file at a time, with retries, then verify every asset before returning.
#
# Usage: upload-release-assets.sh <tag> <dir> <pattern> [<pattern>...]
#   e.g. upload-release-assets.sh v2.0.47 artifacts '*.dmg' '*.zip' 'latest*.yml'
#
# Requires: gh (authenticated via GH_TOKEN), jq. Run from inside the repo checkout.
#
# Safe to re-run: assets that are already fully uploaded at the right size are
# skipped, and half-uploaded "starter" placeholders are deleted before retrying
# (a same-name upload otherwise fails with 422 already_exists).
#
# Timeouts are deliberately generous. On 2026-09-17 GitHub's upload endpoint ran
# at about 0.3 MiB/s, and a short stall timeout would have killed uploads that
# were going to finish.

set -uo pipefail

TAG="${1:?tag required}"
DIR="${2:?artifact directory required}"
shift 2
if [ "$#" -eq 0 ]; then
  echo "Error: at least one file pattern is required"
  exit 1
fi

MAX_ATTEMPTS="${UPLOAD_MAX_ATTEMPTS:-5}"
ATTEMPT_TIMEOUT="${UPLOAD_ATTEMPT_TIMEOUT:-60m}"

# Collect files
FILES=()
for pattern in "$@"; do
  while IFS= read -r f; do
    FILES+=("$f")
  done < <(find "$DIR" -type f -name "$pattern" | sort)
done

if [ "${#FILES[@]}" -eq 0 ]; then
  echo "Error: no files matched in $DIR"
  exit 1
fi

# Release assets are a flat namespace, so two files with the same name would
# silently overwrite each other.
DUPES=$(for f in "${FILES[@]}"; do basename "$f"; done | sort | uniq -d)
if [ -n "$DUPES" ]; then
  echo "Error: duplicate asset names:"
  echo "$DUPES"
  exit 1
fi

echo "Assets to upload to $TAG (${#FILES[@]}):"
for f in "${FILES[@]}"; do
  echo "  $(basename "$f") ($(wc -c < "$f" | tr -d ' ') bytes)"
done

RELEASE_ID=$(gh release view "$TAG" --json databaseId --jq '.databaseId')
if [ -z "$RELEASE_ID" ]; then
  echo "Error: release $TAG not found"
  exit 1
fi

# Prints "<id> <state> <size>" for the named asset, or nothing if absent
asset_info() {
  gh api "repos/{owner}/{repo}/releases/$RELEASE_ID/assets" --paginate \
    --jq ".[] | select(.name == \"$1\") | \"\(.id) \(.state) \(.size)\""
}

is_uploaded() {
  local name="$1" size="$2" info
  info=$(asset_info "$name") || return 1
  [ -n "$info" ] || return 1
  read -r _ state remote_size <<< "$info"
  [ "$state" = "uploaded" ] && [ "$remote_size" = "$size" ]
}

# Delete any existing asset with this name (placeholder or wrong size)
remove_existing() {
  local name="$1" info id
  info=$(asset_info "$name") || return 0
  [ -n "$info" ] || return 0
  read -r id _ _ <<< "$info"
  echo "  Removing existing asset $name (id $id) before upload"
  gh api -X DELETE "repos/{owner}/{repo}/releases/assets/$id" || true
}

upload_one() {
  local file="$1" name size attempt
  name=$(basename "$file")
  size=$(wc -c < "$file" | tr -d ' ')

  if is_uploaded "$name" "$size"; then
    echo "SKIP $name (already uploaded, $size bytes)"
    return 0
  fi

  for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
    echo "UPLOAD $name (attempt $attempt/$MAX_ATTEMPTS, $size bytes)"
    remove_existing "$name"
    if timeout "$ATTEMPT_TIMEOUT" gh release upload "$TAG" "$file" && is_uploaded "$name" "$size"; then
      echo "OK $name"
      return 0
    fi
    echo "  Upload of $name failed or did not verify"
    if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
      sleep $((attempt * 30))
    fi
  done
  return 1
}

FAILED=()
for f in "${FILES[@]}"; do
  upload_one "$f" || FAILED+=("$(basename "$f")")
done

if [ "${#FAILED[@]}" -gt 0 ]; then
  echo "Error: ${#FAILED[@]} asset(s) failed to upload:"
  printf '  %s\n' "${FAILED[@]}"
  exit 1
fi

# Final check of the whole set, so the caller can publish on exit 0
for f in "${FILES[@]}"; do
  name=$(basename "$f")
  size=$(wc -c < "$f" | tr -d ' ')
  if ! is_uploaded "$name" "$size"; then
    echo "Error: final verification failed for $name"
    exit 1
  fi
done

echo "All ${#FILES[@]} assets uploaded and verified on $TAG"
