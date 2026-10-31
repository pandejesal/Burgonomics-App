#!/usr/bin/env bash
# select-xcode-toolchain.sh — discover and validate a COMPATIBLE Xcode
# toolchain pair: Xcode major >= MIN_XCODE_MAJOR (default 26) AND its iOS SDK
# major >= MIN_IOS_SDK_MAJOR (default 26), then point xcode-select at it.
#
# Both floors are enforced because Apple requires BOTH versions: App Store
# submissions must use the current Xcode major AND are built against the
# matching SDK. A candidate passing only one gate is rejected, not selected.
# Among compatible candidates the highest iOS SDK wins (tie: highest Xcode).
#
# Why this exists (A07, 2026-10-14):
#   The previous workflow hard-pinned one specific Xcode 15.x app path (iOS 17
#   SDK) with a silent fallback to whatever the runner default happened to be.
#   That floor is years below Apple's current submission requirement, and the
#   fallback meant a missing pin degraded into "whatever is installed" with no
#   error. GitHub's macOS 14 runner images began deprecating 2026-07-06 and are
#   fully unsupported from 2026-11-02, so the jobs moved to a supported runner
#   (macos-26 is GA since 2026-02-26 and ships Xcode 26.x per the official
#   actions/runner-images README — read, not guessed); this script makes the
#   jobs fail fast and loudly when no compatible toolchain is present instead
#   of building against an arbitrary default.
#
# Deliberately version-agnostic: it never hardcodes an exact Xcode version.
# It scans every $XCODE_SEARCH_ROOT/Xcode*.app (plus the current selection),
# asks each one which Xcode and iOS SDK versions it carries, and picks the
# best candidate that meets BOTH floors. Runner images rotate their default
# Xcode over time; this script tracks the floors, not a point release.
#
# Usage:
#   bash scripts/select-xcode-toolchain.sh                      # discover + select + validate
#   MIN_XCODE_MAJOR=27 MIN_IOS_SDK_MAJOR=27 bash scripts/select-xcode-toolchain.sh
#   XCODE_SELECT_MODE=print bash scripts/select-xcode-toolchain.sh  # dry run: report best, no switch
#
# Test-only override (never set in CI):
#   XCODE_SEARCH_ROOT  scan root instead of /Applications, so the negative
#                      fixture in validate-ios-workflow.test.cjs can run this
#                      REAL script against stub toolchains. Production
#                      default is /Applications.
#
# Credential-free by design: no signing, no network, no secrets, no store
# contact. Safe to run on any Mac with Xcode for local preflight too.
set -euo pipefail

MIN_XCODE_MAJOR="${MIN_XCODE_MAJOR:-26}"
MIN_IOS_SDK_MAJOR="${MIN_IOS_SDK_MAJOR:-26}"
XCODE_SELECT_MODE="${XCODE_SELECT_MODE:-switch}"   # switch | print
XCODE_SEARCH_ROOT="${XCODE_SEARCH_ROOT:-/Applications}"

err() { echo "::error::$*" >&2; echo "ERROR: $*" >&2; }
log() { echo "[select-xcode-toolchain] $*"; }

# "26.5" / "26" / "26.5.1 (17F42)" -> integer for numeric comparison.
# Works in bash 3.2 (macOS system bash): no associative arrays, no readarray.
ver_to_int() {
  local v="${1%% *}"
  local IFS='.'
  # shellcheck disable=SC2206
  local p=($v)
  local major="${p[0]:-0}" minor="${p[1]:-0}" patch="${p[2]:-0}"
  major="${major//[^0-9]/}"; minor="${minor//[^0-9]/}"; patch="${patch//[^0-9]/}"
  printf '%d' "$((${major:-0} * 1000000 + ${minor:-0} * 1000 + ${patch:-0}))"
}

major_of() { local v="${1%% *}"; v="${v%%.*}"; v="${v//[^0-9]/}"; echo "${v:-0}"; }

# ---- 1. Gather candidate Developer dirs ------------------------------------
# Current xcode-select path + every $XCODE_SEARCH_ROOT/Xcode*.app on the machine.
candidates=""
if current="$(xcode-select -p 2>/dev/null)"; then
  candidates="$current"
fi
for app in "$XCODE_SEARCH_ROOT"/Xcode*.app; do
  [ -e "$app" ] || continue
  candidates="$candidates
$app/Contents/Developer"
done

if [ -z "$(printf '%s' "$candidates" | tr -d '[:space:]')" ]; then
  err "no Xcode installations found (no xcode-select path, no $XCODE_SEARCH_ROOT/Xcode*.app)"
  exit 1
fi

# ---- 2. Ask each candidate which Xcode + iOS SDK it carries ------------------
# best*    = best COMPATIBLE candidate (both floors met)
# any*     = best overall, for the error message when nothing qualifies
best_dev=""; best_sdk_int=-1; best_xcode_int=-1; best_xcode_ver=""; best_sdk_ver=""
any_dev="";  any_sdk_int=-1;  any_xcode_int=-1;  any_xcode_ver="";  any_sdk_ver=""
while IFS= read -r dev; do
  [ -n "$dev" ] || continue
  xcodebuild_bin="$dev/usr/bin/xcodebuild"
  if [ ! -x "$xcodebuild_bin" ]; then
    log "skip (no xcodebuild): $dev"
    continue
  fi
  xcode_ver="$(DEVELOPER_DIR="$dev" "$xcodebuild_bin" -version 2>/dev/null | awk '/^Xcode/{print $2; exit}')" || true
  if [ -z "$xcode_ver" ]; then
    log "skip (unreadable -version): $dev"
    continue
  fi
  # xcrun respects DEVELOPER_DIR and prints just "26.5" — far more stable to
  # parse than xcodebuild -sdk ... -version prose. Fallback parses the prose.
  sdk_ver="$(DEVELOPER_DIR="$dev" "$dev/usr/bin/xcrun" --sdk iphoneos --show-sdk-version 2>/dev/null)" || true
  if [ -z "$sdk_ver" ]; then
    sdk_ver="$(DEVELOPER_DIR="$dev" "$xcodebuild_bin" -sdk iphoneos -version 2>/dev/null | awk '{ if (tolower($1)=="sdk" && tolower($2)=="version:") { print $3; exit } }')" || true
  fi
  if [ -z "$sdk_ver" ]; then
    log "skip (no iphoneos SDK): $dev (Xcode $xcode_ver)"
    continue
  fi
  xcode_int="$(ver_to_int "$xcode_ver")"; sdk_int="$(ver_to_int "$sdk_ver")"
  xcode_major="$(major_of "$xcode_ver")"; sdk_major="$(major_of "$sdk_ver")"
  log "found: Xcode $xcode_ver (major $xcode_major), iOS SDK $sdk_ver (major $sdk_major) ($dev)"
  if [ "$sdk_int" -gt "$any_sdk_int" ]; then
    any_sdk_int="$sdk_int"; any_dev="$dev"; any_xcode_ver="$xcode_ver"; any_sdk_ver="$sdk_ver"; any_xcode_int="$xcode_int"
  fi
  # Dual gate — Apple needs BOTH versions; one pass is not enough.
  if [ "$xcode_major" -lt "$MIN_XCODE_MAJOR" ]; then
    log "reject: Xcode major $xcode_major < required $MIN_XCODE_MAJOR"
    continue
  fi
  if [ "$sdk_major" -lt "$MIN_IOS_SDK_MAJOR" ]; then
    log "reject: iOS SDK major $sdk_major < required $MIN_IOS_SDK_MAJOR"
    continue
  fi
  # Compatible: keep the highest SDK; tie -> highest Xcode.
  if [ "$sdk_int" -gt "$best_sdk_int" ] || { [ "$sdk_int" -eq "$best_sdk_int" ] && [ "$xcode_int" -gt "$best_xcode_int" ]; }; then
    best_sdk_int="$sdk_int"; best_xcode_int="$xcode_int"; best_dev="$dev"; best_xcode_ver="$xcode_ver"; best_sdk_ver="$sdk_ver"
  fi
done <<EOF
$candidates
EOF

if [ -z "$best_dev" ]; then
  if [ -n "$any_dev" ]; then
    any_xcode_major="$(major_of "$any_xcode_ver")"; any_sdk_major="$(major_of "$any_sdk_ver")"
    err "no COMPATIBLE toolchain: best installed is Xcode $any_xcode_ver (major $any_xcode_major) with iOS SDK $any_sdk_ver (major $any_sdk_major), but Xcode major >= $MIN_XCODE_MAJOR AND iOS SDK major >= $MIN_IOS_SDK_MAJOR are both required. Install a newer Xcode or use a runner image that carries one (e.g. macos-26 ships Xcode 26.x with iOS 26.x SDKs)."
  else
    err "no Xcode with an evaluable iOS SDK was found on this machine"
  fi
  exit 1
fi

# ---- 3. Select the winner ----------------------------------------------------
log "best compatible candidate: Xcode $best_xcode_ver (iOS SDK $best_sdk_ver) at $best_dev"
if [ "$XCODE_SELECT_MODE" = "print" ]; then
  log "XCODE_SELECT_MODE=print — not switching xcode-select"
else
  if [ "$(id -u)" -eq 0 ]; then
    xcode-select -s "$best_dev"
  elif sudo -n xcode-select -s "$best_dev" 2>/dev/null; then
    :
  else
    err "cannot switch xcode-select to $best_dev (needs root; rerun via sudo or set XCODE_SELECT_MODE=print)"
    exit 1
  fi
fi

# ---- 4. Final validation against the CHOSEN toolchain -------------------------
# Uses DEVELOPER_DIR explicitly so the check is identical on a runner (after
# switching), in print mode, and under the test fixture (no PATH xcodebuild
# needed). xcodebuild and xcrun both honor DEVELOPER_DIR.
sel_ver="$(DEVELOPER_DIR="$best_dev" "$best_dev/usr/bin/xcodebuild" -version 2>/dev/null | awk '/^Xcode/{print $2; exit}')" || true
sel_sdk="$(DEVELOPER_DIR="$best_dev" "$best_dev/usr/bin/xcrun" --sdk iphoneos --show-sdk-version 2>/dev/null)" || true
if [ -z "$sel_sdk" ]; then
  sel_sdk="$(DEVELOPER_DIR="$best_dev" "$best_dev/usr/bin/xcodebuild" -sdk iphoneos -version 2>/dev/null | awk '{ if (tolower($1)=="sdk" && tolower($2)=="version:") { print $3; exit } }')" || true
fi
sel_xcode_major="$(major_of "${sel_ver:-0}")"
sel_sdk_major="$(major_of "${sel_sdk:-0}")"
log "selected: Xcode ${sel_ver:-unknown} (major $sel_xcode_major), iOS SDK ${sel_sdk:-unknown} (major $sel_sdk_major) at $best_dev"
if [ -z "$sel_ver" ] || [ "$sel_xcode_major" -lt "$MIN_XCODE_MAJOR" ]; then
  err "selected Xcode '${sel_ver:-none}' has major < $MIN_XCODE_MAJOR — refusing to continue"
  exit 1
fi
if [ -z "$sel_sdk" ] || [ "$sel_sdk_major" -lt "$MIN_IOS_SDK_MAJOR" ]; then
  err "selected toolchain iOS SDK '${sel_sdk:-none}' has major < $MIN_IOS_SDK_MAJOR — refusing to continue"
  exit 1
fi
log "OK: Xcode major $sel_xcode_major >= $MIN_XCODE_MAJOR AND iOS SDK major $sel_sdk_major >= $MIN_IOS_SDK_MAJOR"
