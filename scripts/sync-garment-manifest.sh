#!/usr/bin/env bash
# Copies the garment manifest (95-GARMENT-TAXONOMY §3.1) to the backend byte-for-byte, prints its
# sha256 and pins it in BOTH anti-drift checks: GARMENT_MANIFEST_SHA256 in
# scripts/garment-manifest-probe.mjs and garmentManifestSHA256 in the backend's
# internal/apisrv/admin/garment_manifest_test.go.
#
#   scripts/sync-garment-manifest.sh [backend-repo]     (default ../grbpwr)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
backend="${1:-$here/../grbpwr}"
src="$here/src/components/managers/tech-card/components/design/garment-manifest.json"
dst="$backend/internal/apisrv/admin/garment-manifest.json"
test -d "$backend/internal/apisrv/admin" || { echo "no backend at $backend" >&2; exit 1; }
cp "$src" "$dst"
sha="$(shasum -a 256 "$src" | cut -d' ' -f1)"
perl -pi -e "s/^const GARMENT_MANIFEST_SHA256 = '[0-9a-f]*';/const GARMENT_MANIFEST_SHA256 = '$sha';/" \
  "$here/scripts/garment-manifest-probe.mjs"
test_file="$backend/internal/apisrv/admin/garment_manifest_test.go"
if test -f "$test_file"; then
  perl -pi -e "s/^const garmentManifestSHA256 = \"[0-9a-f]*\"/const garmentManifestSHA256 = \"$sha\"/" "$test_file"
fi
echo "sha256 $sha"
echo "copied to $dst"
